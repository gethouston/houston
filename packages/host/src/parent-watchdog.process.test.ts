import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitExit(
  child: ChildProcess,
  timeoutMs = 8_000,
): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const pid = child.pid;
      reject(new Error(`host did not exit within ${timeoutMs}ms (pid ${pid})`));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

let active: ChildProcess | null = null;
let tmpHome: string | null = null;
afterEach(() => {
  if (active && active.exitCode === null) {
    try {
      active.kill("SIGKILL");
    } catch {}
  }
  active = null;
  if (tmpHome) {
    rmSync(tmpHome, { recursive: true, force: true });
    tmpHome = null;
  }
});

async function spawnHost(
  supervised: boolean,
): Promise<{ child: ChildProcess; port: number }> {
  const port = await freePort();
  tmpHome = mkdtempSync(join(tmpdir(), "hou-watchdog-"));

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOUSTON_HOME: tmpHome,
    HOUSTON_HOST_BIND: "127.0.0.1",
    HOUSTON_HOST_PORT: String(port),
    HOUSTON_HOST_TOKEN: "test-token",
  };
  if (supervised) env.HOUSTON_SUPERVISED = "1";
  else delete env.HOUSTON_SUPERVISED;

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/local/main.ts"],
    {
      cwd: PACKAGE_ROOT,
      env,
      stdio: [supervised ? "pipe" : "ignore", "pipe", "pipe"],
    },
  );
  active = child;

  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += String(d);
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`host never booted.\nstderr:\n${stderr}`)),
      15_000,
    );
    let out = "";
    child.stdout?.on("data", (d) => {
      out += String(d);
      if (out.includes("HOUSTON_HOST_LISTENING")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(`host exited (code ${code}) before listening.\n${stderr}`),
      );
    });
  });

  return { child, port };
}

async function healthOk(port: number): Promise<boolean> {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  return res.ok;
}

test("HOU-582: Docker boot (no marker, /dev/null stdin) stays up and serves", async () => {
  const { child, port } = await spawnHost(false);
  const pid = child.pid;
  if (pid === undefined) throw new Error("no pid");

  await new Promise((r) => setTimeout(r, 1_000));
  expect(alive(pid)).toBe(true);
  expect(await healthOk(port)).toBe(true);

  child.kill("SIGTERM");
  expect(await waitExit(child)).toBe(0);
}, 25_000);

test("supervised boot (marker + pipe) tears down and exits 0 on stdin EOF", async () => {
  const { child, port } = await spawnHost(true);
  expect(await healthOk(port)).toBe(true);

  child.stdin?.end();
  expect(await waitExit(child)).toBe(0);
}, 25_000);
