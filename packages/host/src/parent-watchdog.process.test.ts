import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

/**
 * The parent-watchdog wiring proven end-to-end against the REAL `local/main.ts`
 * entrypoint — the exact `tsx src/local/main.ts` the self-host Dockerfile and
 * the desktop supervisor both launch. The unit test (parent-watchdog.test.ts)
 * proves the arming logic with an injected stdin; this proves the env-var wiring
 * actually reaches it through a real process boot:
 *
 *   • HOU-582 regression: NO HOUSTON_SUPERVISED + a closed (`/dev/null`) stdin —
 *     the Docker case — must boot and STAY UP serving /health, not crash-loop.
 *   • Supervised: HOUSTON_SUPERVISED=1 + an open pipe we then close (EOF) — the
 *     desktop force-quit case — must tear the host down and exit 0.
 *
 * Scope: this asserts the HOST PROCESS lifecycle (the only thing main.ts controls
 * directly). That the teardown then kills child runtimes is LINK 2, proven on
 * real children in launcher/shutdown.process.test.ts; no provider creds or real
 * runtime are needed (or spawned) here.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A free TCP port, picked by binding :0 then releasing it. */
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

/** True iff a process with `pid` is alive. `kill(pid, 0)` probes without signalling. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = dead. EPERM = alive but not ours (still alive).
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
    } catch {
      /* already gone */
    }
  }
  active = null;
  if (tmpHome) {
    rmSync(tmpHome, { recursive: true, force: true });
    tmpHome = null;
  }
});

/**
 * Spawn the real `local/main.ts` and resolve once it prints its listening banner.
 * `supervised` toggles the HOUSTON_SUPERVISED marker AND the stdin shape: an
 * open pipe (supervised, like the desktop supervisor) vs `/dev/null` (the Docker
 * `tsx` case). Captures stderr so a boot failure is legible.
 */
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
  else delete env.HOUSTON_SUPERVISED; // never inherit a stray marker (HOU-582)

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/local/main.ts"],
    {
      cwd: PACKAGE_ROOT,
      env,
      // Supervised → an open pipe we control the EOF of. Unsupervised → /dev/null,
      // exactly what Docker `tsx` hands the process.
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

  // The bug fired teardown + exit(0) within milliseconds of boot. Give it well
  // past that window: a still-alive, still-serving host is the fix.
  await new Promise((r) => setTimeout(r, 1_000));
  expect(alive(pid)).toBe(true);
  expect(await healthOk(port)).toBe(true);

  child.kill("SIGTERM"); // graceful cleanup; nothing to do with the watchdog
  expect(await waitExit(child)).toBe(0);
}, 25_000);

test("supervised boot (marker + pipe) tears down and exits 0 on stdin EOF", async () => {
  const { child, port } = await spawnHost(true);
  expect(await healthOk(port)).toBe(true); // up and serving while the pipe is open

  child.stdin?.end(); // app force-quit: the supervisor's write-end closes → EOF
  expect(await waitExit(child)).toBe(0); // watchdog tore the host down
}, 25_000);
