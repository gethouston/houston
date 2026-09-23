import { runInVm } from "./run-in-vm";
import {
  type BootCodeVm,
  type CodeVmMachine,
  type RunRequest,
  RunRequestError,
  type RunResult,
} from "./types";

/** The turn ended; its VM is gone and no new one may boot for it. */
export class CodeVmClosedError extends Error {
  constructor() {
    super("code execution for this turn has ended");
    this.name = "CodeVmClosedError";
  }
}

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * The ONE micro-VM a turn runs its code in. Owned by the turn's sandbox
 * facade, so the turn's cleanup closes it on success, failure and
 * cancellation alike; nothing about it outlives the turn or reaches the next
 * tenant this worker serves.
 *
 * `warm` starts the ~4 s boot at turn start, overlapping model setup and the
 * first model call. Calls are serialized: the VM has one workdir. A call that
 * times out, is cancelled, or fails inside the guest leaves processes behind,
 * so that VM is destroyed and the next call of the same turn boots a new one.
 */
export class TurnCodeVm {
  private machine: Promise<CodeVmMachine> | null = null;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly boot: BootCodeVm) {}

  warm(): void {
    if (this.closed || this.machine) return;
    this.start().catch((error: unknown) => {
      console.error(`[code-vm] boot failed (${describe(error)})`);
    });
  }

  run(request: RunRequest, turn: AbortSignal): Promise<RunResult> {
    const next = this.queue.then(() => this.runNow(request, turn));
    this.queue = next.catch(() => undefined);
    return next;
  }

  async close(): Promise<void> {
    this.closed = true;
    const booting = this.machine;
    this.machine = null;
    if (!booting) return;
    // A boot that failed has nothing to close; its failure was reported.
    const machine = await booting.catch(() => null);
    await machine?.close();
  }

  private start(): Promise<CodeVmMachine> {
    const booting = this.boot();
    this.machine = booting;
    booting.catch(() => {
      if (this.machine === booting) this.machine = null;
    });
    return booting;
  }

  private async runNow(
    request: RunRequest,
    turn: AbortSignal,
  ): Promise<RunResult> {
    if (this.closed) throw new CodeVmClosedError();
    const booting = this.machine ?? this.start();
    const machine = await raceAbort(booting, turn);
    // close() landed during the boot and owns that machine now.
    if (this.closed) throw new CodeVmClosedError();
    try {
      const result = await runInVm(machine, request, turn);
      if (result.timedOut) await this.discard(booting);
      return result;
    } catch (error) {
      if (!(error instanceof RunRequestError)) await this.discard(booting);
      throw error;
    }
  }

  private async discard(booting: Promise<CodeVmMachine>): Promise<void> {
    if (this.machine === booting) this.machine = null;
    try {
      await (await booting).close();
    } catch (error) {
      console.error(`[code-vm] close failed (${describe(error)})`);
    }
  }
}
