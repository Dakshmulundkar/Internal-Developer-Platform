import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;

const pass = (msg) => console.log(`PASS  ${msg}`);
const fail = (msg, fix) => {
  fails += 1;
  console.log(`FAIL  ${msg}`);
  if (fix) console.log(`      fix: ${fix}`);
};

const probeOne = (port, host) =>
  new Promise((resolve) => {
    const sock = net.connect({ port, host });
    let settled = false;
    const done = (listening) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(listening);
    };
    sock.setTimeout(750);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });

// Vite binds `localhost`, which may resolve to ::1 only — probe both families.
const probePort = async (port) =>
  (await probeOne(port, "127.0.0.1")) || (await probeOne(port, "::1"));

async function main() {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor >= 18) pass(`Node ${process.versions.node} (>= 18)`);
  else fail(`Node ${process.versions.node} is older than 18`, "install Node 18+ from https://nodejs.org");

  const states = [];
  for (const port of [5174, 8001, 5173]) {
    states.push(`${port}=${(await probePort(port)) ? "LISTENING" : "free"}`);
  }
  pass(`ports ${states.join("  ")}`);

  const envPath = path.join(root, "backend", ".env");
  let envText = null;
  try {
    envText = fs.readFileSync(envPath, "utf8");
  } catch {
    envText = null;
  }
  if (envText !== null) pass("backend/.env exists");
  else fail("backend/.env is missing", "copy backend/.env.example to backend/.env");

  const required = ["SUPABASE_URL", "SUPABASE_KEY", "FERNET_KEY"];
  const valueOf = (text, key) => {
    const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  const missing = required.filter((k) => envText === null || !valueOf(envText, k));
  if (missing.length === 0) pass(`required keys set: ${required.join(", ")}`);
  else fail(`missing or empty in backend/.env: ${missing.join(", ")}`, "fill these in backend/.env (see backend/.env.example)");

  const venvPython = [
    path.join(root, "backend", "venv", "Scripts", "python.exe"),
    path.join(root, "backend", "venv", "bin", "python"),
  ].find((p) => fs.existsSync(p));
  if (venvPython) pass(`venv python found (${path.relative(root, venvPython)})`);
  else fail("backend venv python not found", "run `npm run setup` first");

  // Dev backend listens on 8001; the docker-compose backend on 8000.
  let healthy = false;
  for (const port of [8001, 8000]) {
    try {
      const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
      const data = await res.json();
      const status = data && data.status;
      if (status === "ok" || status === "degraded") {
        healthy = true;
        pass(`backend /health (port ${port}): ${status}`);
        const warnings = Array.isArray(data.config_warnings) ? data.config_warnings : [];
        for (const w of warnings) console.log(`      warning: ${w}`);
        break;
      }
    } catch {
      // try the next port
    }
  }
  if (!healthy) {
    fail("Backend not reachable — start it with `npm run dev` (or `docker-compose up -d` for the compose stack)");
  }

  try {
    const out = execFileSync("git", ["--version"], { stdio: "pipe" }).toString().trim();
    pass(out);
  } catch {
    fail("git not found", "install git from https://git-scm.com");
  }

  console.log("");
  console.log(fails === 0 ? "doctor: all checks passed" : `doctor: ${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
