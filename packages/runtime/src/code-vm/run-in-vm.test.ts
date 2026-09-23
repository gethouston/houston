import { describe, expect, test } from "vitest";
import { fakeVm, hang } from "./fake-vm.test-support";
import { runInVm } from "./run-in-vm";
import { RunRequestError, VM_LIMITS, WORKDIR } from "./types";

const b64 = (text: string) => Buffer.from(text).toString("base64");
const text = (b64text: string) => Buffer.from(b64text, "base64").toString();
const live = () => new AbortController().signal;

describe("runInVm", () => {
  test("seeds inputs, runs the program in the workdir and returns new or changed files", async () => {
    const vm = fakeVm(async ({ argv, options, files }) => {
      expect(argv).toEqual([
        "/usr/bin/python3",
        `${WORKDIR}/__houston_main__.py`,
      ]);
      expect(options.cwd).toBe(WORKDIR);
      expect(options.env.HOME).toBe("/root");
      expect(options.env).not.toHaveProperty("HOUSTON_POOL_WORKER_TOKEN_FILE");
      expect(files.get(`${WORKDIR}/data/in.csv`)?.toString()).toBe("a,b\n");
      files.set(`${WORKDIR}/out/report.txt`, Buffer.from("done"));
      files.set(`${WORKDIR}/data/edit.csv`, Buffer.from("x,y\n"));
      return { stdout: "hello\n", stderr: "warn\n", exitCode: 0 };
    });
    const result = await runInVm(
      vm.machine,
      {
        language: "python",
        code: "print('hello')",
        files: [
          { path: "data/in.csv", contentBase64: b64("a,b\n") },
          { path: "data/edit.csv", contentBase64: b64("a,b\n") },
        ],
      },
      live(),
    );
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "hello\n",
      stderr: "warn\n",
      timedOut: false,
      truncated: false,
      droppedArtifacts: [],
    });
    const byPath = Object.fromEntries(
      result.artifacts.map((a) => [a.path, text(a.contentBase64)]),
    );
    // Same-size edits count as changes: the check is on content, not length.
    expect(byPath).toEqual({
      "out/report.txt": "done",
      "data/edit.csv": "x,y\n",
    });
  });

  test("each call starts from an empty workdir", async () => {
    const seen: string[][] = [];
    const vm = fakeVm(async ({ files }) => {
      seen.push([...files.keys()]);
      files.set(`${WORKDIR}/left-behind.txt`, Buffer.from("x"));
      return {};
    });
    await runInVm(vm.machine, { language: "bash", code: "true" }, live());
    await runInVm(vm.machine, { language: "bash", code: "true" }, live());
    expect(seen[1]).toEqual([`${WORKDIR}/__houston_main__.sh`]);
  });

  test.each([
    [{ language: "ruby", code: "puts 1" }, /unsupported language/],
    [{ language: "bash", code: 42 }, /missing 'code'/],
    [
      {
        language: "bash",
        code: "true",
        files: [{ path: "../escape", contentBase64: "" }],
      },
      /escapes the sandbox workspace/,
    ],
    [
      {
        language: "bash",
        code: "true",
        files: Array.from({ length: VM_LIMITS.maxInputFiles + 1 }, (_, i) => ({
          path: `f${i}`,
          contentBase64: "",
        })),
      },
      /too many input files/,
    ],
  ])("refuses a bad request before touching the VM: %#", async (request, message) => {
    const vm = fakeVm(async () => ({}));
    await expect(runInVm(vm.machine, request as never, live())).rejects.toThrow(
      RunRequestError,
    );
    await expect(runInVm(vm.machine, request as never, live())).rejects.toThrow(
      message,
    );
    expect(vm.execs).toEqual([]);
  });

  test("a program past its timeout comes back timedOut with no artifacts", async () => {
    const vm = fakeVm(hang);
    const result = await runInVm(
      vm.machine,
      { language: "node", code: "for(;;){}", timeoutMs: 20 },
      live(),
    );
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.artifacts).toEqual([]);
  });

  test("clamps the timeout to the sandbox ceiling", async () => {
    let seen: AbortSignal | undefined;
    const vm = fakeVm(async ({ options }) => {
      seen = options.signal;
      return {};
    });
    await runInVm(
      vm.machine,
      { language: "bash", code: "true", timeoutMs: 10_000_000 },
      live(),
    );
    expect(seen?.aborted).toBe(false);
  });

  test("a cancelled turn rejects with the turn's reason", async () => {
    const vm = fakeVm(hang);
    const turn = new AbortController();
    const run = runInVm(
      vm.machine,
      { language: "bash", code: "sleep 99" },
      turn.signal,
    );
    setTimeout(() => turn.abort(new Error("turn cancelled")), 5);
    await expect(run).rejects.toThrow("turn cancelled");
  });

  test("files over the artifact budget are reported, not returned", async () => {
    const big = "x".repeat(VM_LIMITS.maxArtifactBytes);
    const vm = fakeVm(async ({ files }) => {
      files.set(`${WORKDIR}/small.txt`, Buffer.from("ok"));
      files.set(`${WORKDIR}/huge.bin`, Buffer.from(big));
      return {};
    });
    const result = await runInVm(
      vm.machine,
      { language: "bash", code: "true" },
      live(),
    );
    expect(result.artifacts.map((a) => a.path)).toEqual(["small.txt"]);
    expect(result.droppedArtifacts).toEqual(["huge.bin"]);
  });

  test("a hostile listing never names a path outside the workdir", async () => {
    const vm = fakeVm(async () => ({}));
    vm.state.listing = "3\0../../etc/passwd\x003\0/etc/shadow\0";
    const result = await runInVm(
      vm.machine,
      { language: "bash", code: "true" },
      live(),
    );
    expect(result.artifacts).toEqual([]);
    expect(result.droppedArtifacts).toEqual([
      "../../etc/passwd",
      "/etc/shadow",
    ]);
  });

  test("passes truncation through", async () => {
    const vm = fakeVm(async () => ({
      stdout: "y".repeat(VM_LIMITS.maxOutputBytes + 10),
    }));
    const result = await runInVm(
      vm.machine,
      { language: "bash", code: "yes" },
      live(),
    );
    expect(result.truncated).toBe(true);
    expect(result.stdout).toHaveLength(VM_LIMITS.maxOutputBytes);
  });

  test("a housekeeping script that fails is an error, not an empty result", async () => {
    const vm = fakeVm(async () => ({}));
    vm.state.listingExit = 1;
    await expect(
      runInVm(vm.machine, { language: "bash", code: "true" }, live()),
    ).rejects.toThrow(/housekeeping failed \(exit 1\)/);
  });

  test("a cut listing never yields a cut path, and says files are missing", async () => {
    const vm = fakeVm(async ({ files }) => {
      files.set(`${WORKDIR}/a.txt`, Buffer.from("a"));
      return {};
    });
    vm.state.listing = "1\0./a.txt\x001\0./out/rep";
    vm.state.listingCut = true;
    const result = await runInVm(
      vm.machine,
      { language: "bash", code: "true" },
      live(),
    );
    expect(result.artifacts.map((a) => a.path)).toEqual(["a.txt"]);
    expect(result.droppedArtifacts).toEqual([
      "(more files than could be listed; only the first were returned)",
    ]);
  });
});
