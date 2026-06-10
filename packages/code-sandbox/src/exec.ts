import { spawn } from "node:child_process";
import type { Language } from "./types";

const INTERPRETER: Record<Language, string> = {
  python: "python3",
  bash: "bash",
  node: "node",
};

export type ExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
};

/**
 * SIGKILL the whole process GROUP, not just the leader. Untrusted code can fork
 * grandchildren (`subprocess.Popen`, `sleep &`); killing only the direct child
 * leaves them running on the instance — and if a grandchild inherits the stdout
 * pipe it would keep the pipe open forever, so we settle on `exit` (the program
 * is done) and reap the group rather than waiting for `close`. Best-effort: the
 * group may already be gone, which is the success case, so there's nothing to
 * surface.
 */
function killGroup(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already dead — nothing to do */
    }
  }
}

export function runProcess(
  language: Language,
  programPath: string,
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<ExecResult> {
  return new Promise((resolveP) => {
    const child = spawn(INTERPRETER[language], [programPath], {
      cwd,
      // `detached` makes the child its own process-group leader, so killGroup can
      // take out the whole tree of anything it spawns.
      detached: true,
      // Minimal, explicit env: no inherited secrets; HOME/TMPDIR pinned to the
      // disposable workdir so nothing leaks outside it.
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: cwd,
        TMPDIR: cwd,
        LANG: "C.UTF-8",
        PYTHONUNBUFFERED: "1",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const cap = (cur: string, chunk: string): string => {
      if (cur.length >= maxOutputBytes) {
        truncated = true;
        return cur;
      }
      const next = cur + chunk;
      if (next.length > maxOutputBytes) {
        truncated = true;
        return next.slice(0, maxOutputBytes);
      }
      return next;
    };

    child.stdout.on("data", (d: Buffer) => (stdout = cap(stdout, d.toString("utf8"))));
    child.stderr.on("data", (d: Buffer) => (stderr = cap(stderr, d.toString("utf8"))));

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid); // `exit` fires next → finish()
    }, timeoutMs);

    const finish = (exitCode: number | null, extraStderr = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup(child.pid); // reap any grandchildren the program left behind
      resolveP({ exitCode, stdout, stderr: stderr + extraStderr, timedOut, truncated });
    };

    // Settle on `exit` (the program ended) rather than `close` (all stdio closed),
    // which a lingering grandchild could hold open indefinitely.
    child.on("exit", (code) => finish(code));
    child.on("error", (err: Error) =>
      finish(null, `\n[sandbox] failed to start ${INTERPRETER[language]}: ${err.message}`),
    );
  });
}
