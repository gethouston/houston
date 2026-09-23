import { posix } from "node:path";
import {
  type CodeVmMachine,
  LANGUAGES,
  type Language,
  type RunRequest,
  RunRequestError,
  type RunResult,
  VM_LIMITS,
  WORKDIR,
} from "./types";
import { collectVmArtifacts } from "./vm-artifacts";
import { execBounded, housekeeping } from "./vm-exec";

/** Empty the workdir left by the previous call, then create the input dirs. */
export const PREPARE_SCRIPT = 'rm -rf /work && mkdir -p -- "$@"';

/**
 * Every regular file under the cwd as NUL-separated `size`, `./path` pairs.
 * `find -type f` does not follow symlinks, so a link cannot pull a guest file
 * from outside the workdir into the listing.
 */
export const LIST_FILES_SCRIPT =
  'find . -type f -exec sh -c \'for f; do printf "%s\\0%s\\0" "$(stat -c %s "$f")" "$f"; done\' sh {} +';

/**
 * The program in a session of its own; when it exits, whatever it left running
 * in that process group is SIGKILLed, the Cloud Run sandbox's reap. Without
 * it a leftover `cmd &` holding stdout would hold the call open until its
 * timeout. A process that starts its own session escapes this and dies with
 * the VM at the end of the turn.
 */
export const RUN_SCRIPT =
  'setsid "$@" & leader=$!; wait "$leader"; status=$?; kill -KILL -"$leader" 2>/dev/null; exit "$status"';

/** Room for thousands of paths; past it the listing is cut and says so. */
const LISTING_MAX_BYTES = 4 * 1024 * 1024;

/** Absolute, so no call depends on how the guest agent resolves argv[0]. */
const INTERPRETER: Record<Language, string> = {
  python: "/usr/bin/python3",
  bash: "/bin/bash",
  node: "/usr/bin/node",
};

const PROGRAM_FILE: Record<Language, string> = {
  python: "__houston_main__.py",
  bash: "__houston_main__.sh",
  node: "__houston_main__.mjs",
};

/** The request's inputs as guest paths; refuses anything outside the workdir. */
function inputsOf(request: RunRequest): Map<string, Buffer> {
  if (!LANGUAGES.includes(request.language))
    throw new RunRequestError(
      `unsupported language: ${String(request.language)}`,
    );
  if (typeof request.code !== "string")
    throw new RunRequestError("missing 'code' (string)");
  const files = request.files ?? [];
  if (files.length > VM_LIMITS.maxInputFiles)
    throw new RunRequestError(
      `too many input files: ${files.length} (max ${VM_LIMITS.maxInputFiles})`,
    );
  const inputs = new Map<string, Buffer>();
  for (const file of files) {
    if (
      typeof file?.path !== "string" ||
      typeof file.contentBase64 !== "string"
    )
      throw new RunRequestError(
        "each input file needs { path, contentBase64 }",
      );
    const guest = posix.resolve(WORKDIR, file.path);
    if (!guest.startsWith(`${WORKDIR}/`))
      throw new RunRequestError(
        `path escapes the sandbox workspace: ${file.path}`,
      );
    inputs.set(guest, Buffer.from(file.contentBase64, "base64"));
  }
  return inputs;
}

/**
 * One `run_code` call inside an already booted VM. A result with `timedOut`,
 * or any error other than RunRequestError, leaves guest processes running:
 * the caller must close this VM before running anything else in it.
 */
export async function runInVm(
  machine: CodeVmMachine,
  request: RunRequest,
  turn: AbortSignal,
): Promise<RunResult> {
  const inputs = inputsOf(request);
  const timeoutMs = Math.min(
    Math.max(1, request.timeoutMs ?? VM_LIMITS.defaultTimeoutMs),
    VM_LIMITS.maxTimeoutMs,
  );
  const program = `${WORKDIR}/${PROGRAM_FILE[request.language]}`;
  const dirs = new Set([WORKDIR, ...[...inputs.keys()].map(posix.dirname)]);
  // From `/`: the workdir is what this script creates.
  await housekeeping(machine, PREPARE_SCRIPT, [...dirs], "/", turn);
  for (const [path, data] of inputs) await machine.writeFile(path, data, turn);
  await machine.writeFile(program, Buffer.from(request.code, "utf8"), turn);

  const started = Date.now();
  const run = await execBounded(
    machine,
    ["/bin/sh", "-c", RUN_SCRIPT, "sh", INTERPRETER[request.language], program],
    WORKDIR,
    timeoutMs,
    turn,
  );
  const durationMs = Date.now() - started;
  // A timed-out program is still running; its half-written files are not
  // results, and the VM is about to be destroyed anyway.
  if (run.kind === "timeout")
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: true,
      truncated: false,
      artifacts: [],
      droppedArtifacts: [],
      durationMs,
    };
  const listing = await housekeeping(
    machine,
    LIST_FILES_SCRIPT,
    [],
    WORKDIR,
    turn,
    LISTING_MAX_BYTES,
  );
  const { artifacts, dropped } = await collectVmArtifacts({
    machine,
    listing: listing.stdout.toString("utf8"),
    listingCut: listing.truncated,
    skip: program,
    inputs,
    turn,
  });
  return {
    exitCode: run.result.exitCode,
    stdout: run.result.stdout.toString("utf8"),
    stderr: run.result.stderr.toString("utf8"),
    timedOut: false,
    truncated: run.result.truncated,
    artifacts,
    droppedArtifacts: dropped,
    durationMs,
  };
}
