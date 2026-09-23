import { posix } from "node:path";
import { LIST_FILES_SCRIPT, PREPARE_SCRIPT, RUN_SCRIPT } from "./run-in-vm";
import {
  type CodeVmMachine,
  type VmExecOptions,
  type VmExecResult,
  WORKDIR,
} from "./types";

export interface FakeProgramContext {
  argv: string[];
  options: VmExecOptions;
  files: Map<string, Buffer>;
}

export type FakeProgram = (
  ctx: FakeProgramContext,
) => Promise<{ exitCode?: number; stdout?: string; stderr?: string }>;

const cap = (text: string, max: number) => {
  const buf = Buffer.from(text);
  return { buf: buf.subarray(0, max), cut: buf.byteLength > max };
};

/**
 * An in-memory stand-in for a booted Gondolin VM. It understands the two
 * housekeeping scripts run-in-vm.ts sends and hands every interpreter call to
 * the test's `program`, which sees the guest files and may hang until aborted.
 */
export function fakeVm(program: FakeProgram) {
  const files = new Map<string, Buffer>();
  // Like the real guest: an exec cannot start in a missing cwd, and a write
  // does not create its parent directory.
  const dirs = new Set<string>(["/", "/root", "/tmp"]);
  const execs: { argv: string[]; options: VmExecOptions }[] = [];
  const state = {
    closed: false,
    listing: null as string | null,
    listingExit: 0,
    listingCut: false,
  };
  const machine: CodeVmMachine = {
    async exec(argv, options): Promise<VmExecResult> {
      if (state.closed) throw new Error("vm closed");
      if (!dirs.has(options.cwd))
        throw new Error(`exec cwd missing: ${options.cwd}`);
      execs.push({ argv, options });
      let out = "";
      let err = "";
      let exitCode = 0;
      if (argv[2] === PREPARE_SCRIPT) {
        for (const path of [...files.keys()])
          if (path.startsWith(`${WORKDIR}/`)) files.delete(path);
        for (const dir of [...dirs])
          if (dir === WORKDIR || dir.startsWith(`${WORKDIR}/`))
            dirs.delete(dir);
        for (const dir of argv.slice(4))
          for (let d = dir; d !== "/"; d = posix.dirname(d)) dirs.add(d);
      } else if (argv[2] === LIST_FILES_SCRIPT) {
        exitCode = state.listingExit;
        out =
          state.listing ??
          [...files.entries()]
            .filter(([path]) => path.startsWith(`${options.cwd}/`))
            .map(
              ([path, data]) =>
                `${data.byteLength}\0./${posix.relative(options.cwd, path)}\0`,
            )
            .join("");
      } else {
        // The program's own argv, as RUN_SCRIPT hands it to setsid.
        const programArgv = argv[2] === RUN_SCRIPT ? argv.slice(4) : argv;
        const result = await program({ argv: programArgv, options, files });
        out = result.stdout ?? "";
        err = result.stderr ?? "";
        exitCode = result.exitCode ?? 0;
      }
      const stdout = cap(out, options.maxOutputBytes);
      const stderr = cap(err, options.maxOutputBytes);
      return {
        exitCode,
        stdout: stdout.buf,
        stderr: stderr.buf,
        truncated:
          stdout.cut ||
          stderr.cut ||
          (argv[2] === LIST_FILES_SCRIPT && state.listingCut),
      };
    },
    async writeFile(path, data) {
      if (state.closed) throw new Error("vm closed");
      if (!dirs.has(posix.dirname(path)))
        throw new Error(`file_write_failed: FileNotFound (${path})`);
      files.set(path, Buffer.from(data));
    },
    async readFile(path, maxBytes) {
      if (state.closed) throw new Error("vm closed");
      const data = files.get(path);
      if (!data) throw new Error(`no such file: ${path}`);
      return data.byteLength > maxBytes ? null : data;
    },
    async close() {
      state.closed = true;
    },
  };
  return { machine, files, execs, state };
}

/** A program that never finishes on its own, like `while True: pass`. */
export const hang: FakeProgram = ({ options }) =>
  new Promise((_, reject) => {
    options.signal.addEventListener("abort", () =>
      reject(new Error("exec aborted")),
    );
  });
