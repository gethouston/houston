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

function killGroup(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
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
      detached: true,
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

    child.stdout.on(
      "data",
      (d: Buffer) => (stdout = cap(stdout, d.toString("utf8"))),
    );
    child.stderr.on(
      "data",
      (d: Buffer) => (stderr = cap(stderr, d.toString("utf8"))),
    );

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);

    const finish = (exitCode: number | null, extraStderr = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup(child.pid);
      resolveP({
        exitCode,
        stdout,
        stderr: stderr + extraStderr,
        timedOut,
        truncated,
      });
    };

    child.on("exit", (code) => finish(code));
    child.on("error", (err: Error) =>
      finish(
        null,
        `\n[sandbox] failed to start ${INTERPRETER[language]}: ${err.message}`,
      ),
    );
  });
}
