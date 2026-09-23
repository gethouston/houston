import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { fakeVm } from "./fake-vm.test-support";
import { assertCodeVmReady, PROBE_PROGRAM } from "./preflight";

const kvm = () => {
  const path = join(mkdtempSync(join(tmpdir(), "kvm-")), "kvm");
  writeFileSync(path, "");
  return path;
};

describe("assertCodeVmReady", () => {
  test("boots a VM, imports every promised library, and closes it", async () => {
    const vm = fakeVm(async ({ files }) => {
      const program = [...files.entries()].find(([p]) => p.endsWith(".py"));
      expect(program?.[1].toString()).toBe(PROBE_PROGRAM);
      return { stdout: "ok\n" };
    });
    const ready = await assertCodeVmReady({
      boot: async () => vm.machine,
      kvmPath: kvm(),
      guestDir: "/opt/gondolin/guest",
    });
    expect(ready.bootAndProbeMs).toBeGreaterThanOrEqual(0);
    expect(vm.state.closed).toBe(true);
  });

  test("no /dev/kvm is a named failure", async () => {
    await expect(
      assertCodeVmReady({
        boot: async () => fakeVm(async () => ({})).machine,
        kvmPath: "/nonexistent/kvm",
        guestDir: "/opt/gondolin/guest",
      }),
    ).rejects.toThrow(/needs read-write \/nonexistent\/kvm/);
  });

  test("the stock guest image is refused", async () => {
    await expect(
      assertCodeVmReady({
        boot: async () => fakeVm(async () => ({})).machine,
        kvmPath: kvm(),
        guestDir: undefined,
      }),
    ).rejects.toThrow(/GONDOLIN_GUEST_DIR/);
  });

  test("a guest missing a library fails with its import error", async () => {
    const vm = fakeVm(async () => ({
      exitCode: 1,
      stderr: "ModuleNotFoundError: No module named 'pptx'",
    }));
    await expect(
      assertCodeVmReady({
        boot: async () => vm.machine,
        kvmPath: kvm(),
        guestDir: "/opt/gondolin/guest",
      }),
    ).rejects.toThrow(/No module named 'pptx'/);
    expect(vm.state.closed).toBe(true);
  });
});
