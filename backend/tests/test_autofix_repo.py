"""repo_service safety tests — the guards that must never regress.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import pytest

from services.autofix.repo_service import (
    BRANCH_PREFIX,
    RepoAccessError,
    push_and_open_pr,
    redact,
    tree_size_mb,
    validate_full_name,
)


def test_validate_accepts_owner_slash_repo():
    for good in ("octocat/hello-world", "my-org/my.repo_name-2", "a/b"):
        validate_full_name(good)  # must not raise


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "   ",
        "owner",
        "owner/repo/extra",
        "https://github.com/o/r",
        "git@github.com:o/r.git",
        "../escape",
        "o/r;rm -rf",
        "o/re po",
        "/abs/path",
        "o/",
    ],
)
def test_validate_rejects_anything_else(bad):
    with pytest.raises(RepoAccessError):
        validate_full_name(bad)


def test_redact_strips_token_and_embedded_urls():
    out = redact(
        "fatal: https://x-access-token:ghp_SECRET@github.com/o/r.git denied: ghp_SECRET",
        ["ghp_SECRET"],
    )
    assert "ghp_SECRET" not in out
    assert "https://***@github.com" in out


def test_redact_handles_none_and_no_secrets():
    assert redact(None) == ""
    assert redact("plain message") == "plain message"


def test_push_refuses_non_autofix_branch(tmp_path):
    with pytest.raises(RepoAccessError) as excinfo:
        push_and_open_pr(tmp_path, "o/r", "tok", "main", "t", "b")
    assert BRANCH_PREFIX in str(excinfo.value)


def test_tree_size_mb_measures_files(tmp_path):
    (tmp_path / "a.txt").write_bytes(b"x" * (2 * 1024 * 1024))
    assert tree_size_mb(tmp_path) == 2.0
