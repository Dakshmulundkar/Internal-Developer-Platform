import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const candidates = [
  path.join(root, "backend", "venv", "Scripts", "python.exe"),
  path.join(root, "backend", "venv", "bin", "python"),
];
const python = candidates.find((p) => fs.existsSync(p));

if (!python) {
  console.error("Backend venv not found — run `npm run setup` first.");
  process.exit(1);
}

const child = spawn(
  python,
  ["-m", "uvicorn", "main:app", "--reload", "--port", "8001"],
  { cwd: path.join(root, "backend"), stdio: "inherit" },
);

child.on("error", (err) => {
  console.error(`Could not start backend: ${err.message}`);
  console.error("Try: npm run setup");
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
