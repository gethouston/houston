import { accessSync, constants } from "node:fs";
import { TurnCodeVm } from "./turn-code-vm";
import type { BootCodeVm } from "./types";

/** The imports run_code's prompt promises (packages/code-sandbox/requirements.txt). */
export const PROBE_PROGRAM =
  "import pandas, openpyxl, pptx, matplotlib, PIL, requests\nprint('ok')";

/**
 * Boot-time proof that this worker can serve `vm` mode, run before it
 * registers with the pool: KVM is reachable, the baked guest image is the one
 * configured, and a real VM boots and imports every promised library. A
 * worker that fails here crash-loops where it shows, instead of registering
 * and failing every code-running turn it is handed.
 */
export async function assertCodeVmReady(input: {
  boot: BootCodeVm;
  kvmPath?: string;
  guestDir?: string | undefined;
}): Promise<{ bootAndProbeMs: number }> {
  const kvmPath = input.kvmPath ?? "/dev/kvm";
  try {
    accessSync(kvmPath, constants.R_OK | constants.W_OK);
  } catch {
    throw new Error(
      `HOUSTON_CODE_EXECUTION=vm needs read-write ${kvmPath}: a privileged pod on a node with nested virtualization`,
    );
  }
  if (!input.guestDir)
    throw new Error(
      "HOUSTON_CODE_EXECUTION=vm needs GONDOLIN_GUEST_DIR: the stock guest has none of the Python libraries run_code promises, and a VM with no network cannot install them",
    );
  const started = Date.now();
  const vm = new TurnCodeVm(input.boot);
  try {
    const result = await vm.run(
      { language: "python", code: PROBE_PROGRAM },
      AbortSignal.timeout(60_000),
    );
    if (result.exitCode !== 0 || result.stdout.trim() !== "ok")
      throw new Error(
        `code VM probe failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
      );
  } finally {
    await vm.close();
  }
  return { bootAndProbeMs: Date.now() - started };
}
