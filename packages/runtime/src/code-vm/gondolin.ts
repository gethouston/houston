import type { VM } from "@earendil-works/gondolin";
import type { BootCodeVm, CodeVmMachine, VmExecResult } from "./types";

/**
 * Guest sizing. Measured on GKE staging (2026-09-23, n2 nested KVM): boot p50
 * 4.0 s and ~5 CPU-seconds, 226 MiB resident idle, ~290 MiB after a script.
 * 1G is the guest's ceiling, not its reservation.
 */
const GUEST_MEMORY = "1G";
const GUEST_CPUS = 2;
/** Past this the host is starved or KVM is missing; the call gets a 502. */
const START_TIMEOUT_MS = 30_000;
/** One artifact read; a stuck read would otherwise hold Gondolin's file channel. */
const READ_TIMEOUT_MS = 30_000;

/** SIGKILL, where "already gone" is the success case. */
function killHard(pid: number) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

/** Keeps the first `max` bytes of a stream and counts the rest. */
function cappedSink(max: number) {
  const chunks: Buffer[] = [];
  let kept = 0;
  let cut = false;
  return {
    push(data: Buffer) {
      const room = max - kept;
      if (data.byteLength > room) cut = true;
      if (room <= 0) return;
      const slice = data.subarray(0, room);
      chunks.push(slice);
      kept += slice.byteLength;
    },
    done: () => ({ data: Buffer.concat(chunks), cut }),
  };
}

function machineOf(vm: VM): CodeVmMachine {
  return {
    async exec(argv, options): Promise<VmExecResult> {
      const proc = vm.exec(argv, {
        cwd: options.cwd,
        env: options.env,
        signal: options.signal,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = cappedSink(options.maxOutputBytes);
      const stderr = cappedSink(options.maxOutputBytes);
      // Drained to the end even past the cap: the guest blocks on a full pipe.
      const drain = (async () => {
        for await (const chunk of proc.output())
          (chunk.stream === "stdout" ? stdout : stderr).push(chunk.data);
      })();
      const [result] = await Promise.all([proc.result, drain]);
      const out = stdout.done();
      const err = stderr.done();
      return {
        exitCode: result.exitCode,
        stdout: out.data,
        stderr: err.data,
        truncated: out.cut || err.cut,
      };
    },
    async writeFile(path, data, signal) {
      await vm.fs.writeFile(path, data, { signal });
    },
    async readFile(path, maxBytes, signal) {
      // Its own signal: Gondolin runs one guest file operation at a time and
      // only an abort (not destroying the stream) ends one early, so an
      // oversized or stuck read must be aborted or every later read waits.
      const stop = new AbortController();
      const onAbort = () => stop.abort(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(
        () => stop.abort(new Error(`reading ${path} took over 30 s`)),
        READ_TIMEOUT_MS,
      );
      try {
        const stream = await vm.fs.readFileStream(path, {
          signal: stop.signal,
        });
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          total += chunk.byteLength;
          if (total > maxBytes) {
            stop.abort(new Error("over the listed size"));
            stream.destroy();
            return null;
          }
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    },
    async close() {
      // The VM holds a tenant's processes, so "closed" must mean QEMU is gone:
      // if Gondolin's teardown fails, kill QEMU itself.
      const pid = vm.getHostPid();
      try {
        await vm.close();
      } catch (error) {
        if (pid === null) throw error;
        killHard(pid);
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[code-vm] close failed, QEMU killed (${detail})`);
      }
    },
  };
}

/**
 * Boot one Gondolin micro-VM with NO network device: `netEnabled: false`
 * leaves the NIC out of the QEMU command line, so the guest cannot reach the
 * node's metadata server, the pod network or the internet (verified on
 * staging). The rootfs lives in guest memory and dies with the VM. The guest
 * image comes from GONDOLIN_GUEST_DIR, baked into the pool image with the
 * Python libraries run_code promises, since nothing can be installed offline.
 *
 * Imported lazily: only a pool worker in `vm` mode ever loads Gondolin.
 */
export const bootGondolinVm: BootCodeVm = async () => {
  const { VM } = await import("@earendil-works/gondolin");
  const vm = await VM.create({
    rootfs: { mode: "memory" },
    sandbox: { netEnabled: false },
    memory: GUEST_MEMORY,
    cpus: GUEST_CPUS,
    startTimeoutMs: START_TIMEOUT_MS,
    sessionLabel: "houston-run-code",
  });
  try {
    await vm.start();
  } catch (error) {
    try {
      await vm.close();
    } catch (closeError) {
      const detail =
        closeError instanceof Error ? closeError.message : String(closeError);
      console.error(`[code-vm] close after a failed boot failed (${detail})`);
    }
    throw error;
  }
  return machineOf(vm);
};
