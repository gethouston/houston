import { type CodeVmMachine, VM_LIMITS, type VmExecResult } from "./types";

/**
 * Minimal and non-secret, like the Cloud Run sandbox's. HOME and TMPDIR stay
 * OUTSIDE the workdir so caches (matplotlib, pip) never come back as files.
 */
const GUEST_ENV = {
  PATH: "/usr/local/bin:/usr/bin:/bin",
  HOME: "/root",
  TMPDIR: "/tmp",
  LANG: "C.UTF-8",
  PYTHONUNBUFFERED: "1",
  PYTHONDONTWRITEBYTECODE: "1",
};

/** Housekeeping (prepare, listing) is quick; past this the guest is wedged. */
const HOUSEKEEPING_TIMEOUT_MS = 30_000;

/** A VM that did not answer housekeeping in time. The owner must discard it. */
export class CodeVmUnresponsiveError extends Error {
  constructor() {
    super("the code VM stopped answering");
    this.name = "CodeVmUnresponsiveError";
  }
}

export type Bounded =
  | { kind: "done"; result: VmExecResult }
  | { kind: "timeout" };

/** Run one guest command under a deadline and the turn's own signal. */
export async function execBounded(
  machine: CodeVmMachine,
  argv: string[],
  cwd: string,
  timeoutMs: number,
  turn: AbortSignal,
  maxOutputBytes: number = VM_LIMITS.maxOutputBytes,
): Promise<Bounded> {
  const stop = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stop.abort(new Error("timeout"));
  }, timeoutMs);
  const onTurnAbort = () => stop.abort(turn.reason);
  turn.addEventListener("abort", onTurnAbort, { once: true });
  // Raced, not trusted: an adapter that keeps waiting after the abort must
  // not hold the tool call. The guest process lives on until the VM closes.
  const aborted = new Promise<never>((_, reject) => {
    stop.signal.addEventListener("abort", () => reject(stop.signal.reason), {
      once: true,
    });
  });
  aborted.catch(() => undefined);
  try {
    if (turn.aborted) throw turn.reason;
    const result = await Promise.race([
      machine.exec(argv, {
        cwd,
        env: GUEST_ENV,
        signal: stop.signal,
        maxOutputBytes,
      }),
      aborted,
    ]);
    return { kind: "done", result };
  } catch (error) {
    if (turn.aborted) throw turn.reason;
    if (timedOut) return { kind: "timeout" };
    throw error;
  } finally {
    clearTimeout(timer);
    turn.removeEventListener("abort", onTurnAbort);
  }
}

/**
 * A shell script of ours, not the program's. A non-zero exit means the guest
 * is not in the state the next step assumes, so it throws (and the owner
 * discards the VM) rather than carrying on.
 */
export async function housekeeping(
  machine: CodeVmMachine,
  script: string,
  args: string[],
  cwd: string,
  turn: AbortSignal,
  maxOutputBytes?: number,
): Promise<VmExecResult> {
  const bounded = await execBounded(
    machine,
    ["/bin/sh", "-c", script, "sh", ...args],
    cwd,
    HOUSEKEEPING_TIMEOUT_MS,
    turn,
    maxOutputBytes,
  );
  if (bounded.kind === "timeout") throw new CodeVmUnresponsiveError();
  if (bounded.result.exitCode !== 0)
    throw new Error(
      `code VM housekeeping failed (exit ${bounded.result.exitCode}): ${bounded.result.stderr.toString("utf8").slice(0, 500)}`,
    );
  return bounded.result;
}
