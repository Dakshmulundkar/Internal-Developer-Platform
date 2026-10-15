"""OpenAI-powered small-fix engine for Repo Auto-Fix.

Policy (user-approved): only SMALL problems are fixed automatically —
a single file with few errors. Anything bigger becomes a triage ticket
(see triage.py) instead of an automated fix.

- OpenAI only (gpt-4o-mini, cheap + JSON mode). No Groq/Grok here.
- The model returns a full corrected file; we accept it only if re-linting
  proves the error count went DOWN (never worse, never unlintable).
- Never raises: every failure returns (None, reason).
"""

import json
import logging
from pathlib import Path

import httpx

from config import settings

logger = logging.getLogger(__name__)

AI_MODEL = "gpt-4o-mini"
AI_TIMEOUT = 60
# A "small" fix: one file, few errors, fits comfortably in context.
AI_SMALL_MAX_ERRORS = 5
AI_MAX_FILE_BYTES = 30_000
# Cost guard: at most this many AI-fixed files per apply run.
AI_MAX_FILES_PER_RUN = 5

_SYSTEM_PROMPT = (
    "You fix lint errors in a single source file. Rules: "
    "1) Fix ONLY the listed lint errors with the smallest possible change. "
    "2) Do not refactor, rename, or change behavior. "
    "3) Do not add dependencies. "
    "4) Return ONLY a JSON object {\"fixed_code\": \"<entire corrected file>\"}. "
    "Never wrap it in markdown fences."
)

# Rule-code -> plain-language cause hint, used for triage tickets.
_CAUSE_HINTS = {
    # eslint
    "no-unused-vars": "unused variables or imports left in the file",
    "no-undef": "a name is used but never defined or imported",
    "no-redeclare": "the same name is declared twice in one scope",
    "eqeqeq": "loose == comparison instead of strict ===",
    "no-console": "leftover console.* debug statements",
    "no-debugger": "leftover debugger statement",
    "semi": "missing or extra semicolons",
    "quotes": "wrong quote style for string literals",
    "indent": "inconsistent indentation",
    "no-var": "old-style var instead of let/const",
    "prefer-const": "let used where the value never changes",
    "no-explicit-any": "explicit `any` types hiding type errors",
    "react-hooks/rules-of-hooks": "React Hook called conditionally or outside a component",
    "react-hooks/exhaustive-deps": "useEffect/useCallback dependency array is incomplete",
    # ruff
    "F401": "imported module is never used",
    "F821": "a name is used but never defined",
    "F841": "assigned variable is never used",
    "E9": "probable syntax error — Python cannot parse the file",
    "E501": "lines longer than the configured limit",
    "I001": "imports are not sorted",
    "W291": "trailing whitespace",
    "W293": "blank line contains whitespace",
}


def ai_available() -> bool:
    """True when an OpenAI key is configured server-side."""
    return bool((settings.OPENAI_API_KEY or "").strip())


def classify_file(tool: str, error_count: int, size_bytes: int) -> tuple:
    """Return (size_class, reason): 'small' may go to the LLM, 'large' goes to triage."""
    _ = tool
    if size_bytes > AI_MAX_FILE_BYTES:
        return "large", f"file is {size_bytes // 1024} KB (over the 30 KB AI limit)"
    if error_count > AI_SMALL_MAX_ERRORS:
        return "large", f"{error_count} errors (over the {AI_SMALL_MAX_ERRORS}-error AI limit)"
    if error_count <= 0:
        return "large", "no errors to fix"
    return "small", ""


def cause_hint(tool: str, messages: list) -> str:
    """One-line plain-language cause from the top lint rules."""
    _ = tool
    rules = []
    for msg in messages or []:
        rule = (msg.get("rule") or "unknown").split("/")[-1]
        if rule not in rules:
            rules.append(rule)
    hints = [_CAUSE_HINTS.get(r, f"rule {r}") for r in rules[:3]]
    if not hints:
        return "multiple lint problems need human review"
    if len(hints) == 1:
        return hints[0]
    return "; ".join(hints[:-1]) + f", and {hints[-1]}"


def fix_file(tool: str, rel_file: str, code: str, messages: list) -> tuple:
    """Ask OpenAI for a corrected file. Returns (fixed_code, None) or (None, reason).

    The caller must re-lint the result (see lint_runner.lint_file_errors)
    and only keep it when the error count decreased.
    """
    if not ai_available():
        return None, "OpenAI API key is not configured (set OPENAI_API_KEY in backend/.env)"
    errors = [
        {"rule": m.get("rule"), "line": m.get("line"), "message": m.get("message")}
        for m in (messages or [])[:10]
    ]
    payload = {
        "model": AI_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {"file": rel_file, "errors": errors, "code": code}
                ),
            },
        ],
    }
    try:
        with httpx.Client(timeout=AI_TIMEOUT) as client:
            resp = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                json=payload,
            )
    except Exception as exc:
        logger.warning("OpenAI fix request failed: %s", type(exc).__name__)
        return None, "could not reach OpenAI — try again"
    if resp.status_code == 401:
        return None, "OpenAI rejected the API key — check OPENAI_API_KEY"
    if resp.status_code == 429:
        return None, "OpenAI rate limit hit — try again in a minute"
    if resp.status_code != 200:
        return None, f"OpenAI returned status {resp.status_code}"
    try:
        fixed = resp.json()["choices"][0]["message"]["content"]
        fixed_code = json.loads(fixed.strip())["fixed_code"]
    except (KeyError, IndexError, json.JSONDecodeError, TypeError, AttributeError):
        return None, "OpenAI returned an unusable response"
    if not isinstance(fixed_code, str) or not fixed_code.strip():
        return None, "OpenAI returned an empty fix"
    if len(fixed_code) > 3 * max(len(code), 1):
        return None, "OpenAI returned a suspiciously large rewrite — discarded"
    return fixed_code, None


def file_size_bytes(path: Path, rel_file: str) -> int:
    try:
        return (path / rel_file).stat().st_size
    except OSError:
        return 0
