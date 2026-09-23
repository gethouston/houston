/**
 * The per-turn code micro-VM, as the rest of the runtime sees it.
 *
 * `run_code` in a pool worker used to leave the process: a relay through the
 * gateway to a reused Cloud Run instance that kept residue between tenants. In
 * `vm` mode the worker boots a disposable micro-VM (Gondolin: QEMU + KVM, no
 * NIC) inside its own pod for the turn, runs every call of that turn in it,
 * and destroys it when the turn ends. The request and result shapes are the
 * Cloud Run sandbox's (packages/code-sandbox/src/types.ts), so the tool, its
 * artifact write-back and the model-facing summary do not change.
 */

/** Every call runs here; each call empties it first. */
export const WORKDIR = "/work";

export type Language = "python" | "bash" | "node";
export const LANGUAGES: readonly Language[] = ["python", "bash", "node"];

export interface RunRequest {
  language: Language;
  code: string;
  files?: { path: string; contentBase64: string }[];
  timeoutMs?: number;
}

export interface Artifact {
  path: string;
  contentBase64: string;
  bytes: number;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  artifacts: Artifact[];
  droppedArtifacts: string[];
  durationMs: number;
}

/**
 * The Cloud Run sandbox's DEFAULT_LIMITS, held here rather than imported: the
 * runtime image does not ship packages/code-sandbox. vm-limits.test.ts pins
 * the two copies together.
 */
export const VM_LIMITS = {
  maxTimeoutMs: 120_000,
  defaultTimeoutMs: 60_000,
  maxOutputBytes: 256 * 1024,
  maxInputFiles: 64,
  maxArtifactBytes: 16 * 1024 * 1024,
} as const;

export interface VmExecOptions {
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
  /** Per-stream cap; the rest of the stream is drained and discarded. */
  maxOutputBytes: number;
}

export interface VmExecResult {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
  truncated: boolean;
}

/**
 * One booted micro-VM. Aborting an exec's signal only stops the WAIT: the
 * guest process keeps running, so a caller that aborts must close the VM.
 */
export interface CodeVmMachine {
  exec(argv: string[], options: VmExecOptions): Promise<VmExecResult>;
  writeFile(path: string, data: Buffer, signal: AbortSignal): Promise<void>;
  /** The file's bytes, or null when it is longer than `maxBytes`. */
  readFile(
    path: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<Buffer | null>;
  close(): Promise<void>;
}

/** Boot a fresh VM; resolves once the guest answers. */
export type BootCodeVm = () => Promise<CodeVmMachine>;

/** The request itself is wrong (bad language, escaping path, too many files). */
export class RunRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunRequestError";
  }
}
