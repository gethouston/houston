import { afterEach, describe, expect, test, vi } from "vitest";
import { type FakeProgram, fakeVm, hang } from "./fake-vm.test-support";
import { CodeVmClosedError, TurnCodeVm } from "./turn-code-vm";
import type { CodeVmMachine } from "./types";

const live = () => new AbortController().signal;
const bash = { language: "bash" as const, code: "true" };

function booter(program: FakeProgram = async () => ({ stdout: "ok" })) {
  const vms: ReturnType<typeof fakeVm>[] = [];
  const boot = vi.fn(async () => {
    const vm = fakeVm(program);
    vms.push(vm);
    return vm.machine;
  });
  return { boot, vms };
}

afterEach(() => vi.restoreAllMocks());

describe("TurnCodeVm", () => {
  test("warm boots once and every call of the turn shares that VM", async () => {
    const { boot, vms } = booter();
    const vm = new TurnCodeVm(boot);
    vm.warm();
    vm.warm();
    await vm.run(bash, live());
    await vm.run(bash, live());
    expect(boot).toHaveBeenCalledTimes(1);
    expect(vms[0]?.state.closed).toBe(false);
    await vm.close();
    expect(vms[0]?.state.closed).toBe(true);
  });

  test("a turn that never warmed boots on its first call", async () => {
    const { boot } = booter();
    const vm = new TurnCodeVm(boot);
    expect(boot).not.toHaveBeenCalled();
    expect((await vm.run(bash, live())).stdout).toBe("ok");
    expect(boot).toHaveBeenCalledTimes(1);
    await vm.close();
  });

  test("a timed-out call destroys the VM and the next call gets a fresh one", async () => {
    let calls = 0;
    const { boot, vms } = booter((ctx) =>
      calls++ === 0 ? hang(ctx) : Promise.resolve({ stdout: "fresh" }),
    );
    const vm = new TurnCodeVm(boot);
    const first = await vm.run({ ...bash, timeoutMs: 10 }, live());
    expect(first.timedOut).toBe(true);
    expect(vms[0]?.state.closed).toBe(true);
    expect((await vm.run(bash, live())).stdout).toBe("fresh");
    expect(boot).toHaveBeenCalledTimes(2);
    await vm.close();
  });

  test("a VM failure destroys the VM; a bad request does not", async () => {
    const { boot, vms } = booter(async () => {
      throw new Error("virtio went away");
    });
    const vm = new TurnCodeVm(boot);
    await expect(
      vm.run({ language: "cobol", code: "" } as never, live()),
    ).rejects.toThrow(/unsupported language/);
    expect(vms[0]?.state.closed).toBe(false);
    await expect(vm.run(bash, live())).rejects.toThrow("virtio went away");
    expect(vms[0]?.state.closed).toBe(true);
    await vm.close();
  });

  test("a cancelled turn destroys the VM", async () => {
    const { boot, vms } = booter(hang);
    const vm = new TurnCodeVm(boot);
    const turn = new AbortController();
    const run = vm.run(bash, turn.signal);
    setTimeout(() => turn.abort(new Error("stop")), 5);
    await expect(run).rejects.toThrow("stop");
    expect(vms[0]?.state.closed).toBe(true);
  });

  test("close is final: no call runs and no boot starts afterwards", async () => {
    const { boot } = booter();
    const vm = new TurnCodeVm(boot);
    await vm.close();
    vm.warm();
    await expect(vm.run(bash, live())).rejects.toThrow(CodeVmClosedError);
    expect(boot).not.toHaveBeenCalled();
  });

  test("closing during a boot destroys the VM when the boot lands", async () => {
    let finishBoot: (machine: CodeVmMachine) => void = () => undefined;
    const fake = fakeVm(async () => ({}));
    const vm = new TurnCodeVm(
      () => new Promise((resolve) => (finishBoot = resolve)),
    );
    vm.warm();
    const closing = vm.close();
    finishBoot(fake.machine);
    await closing;
    expect(fake.state.closed).toBe(true);
  });

  test("a failed warm boot is reported and the first call retries it", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    let attempt = 0;
    const fake = fakeVm(async () => ({ stdout: "second boot" }));
    const vm = new TurnCodeVm(async () => {
      if (attempt++ === 0) throw new Error("no /dev/kvm");
      return fake.machine;
    });
    vm.warm();
    await vi.waitFor(() => expect(report).toHaveBeenCalled());
    expect(String(report.mock.calls[0]?.[0])).toContain("no /dev/kvm");
    expect((await vm.run(bash, live())).stdout).toBe("second boot");
    await vm.close();
  });

  test("calls never overlap inside the VM", async () => {
    const order: string[] = [];
    let n = 0;
    const { boot } = booter(async () => {
      const id = n++;
      order.push(`start ${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${id}`);
      return {};
    });
    const vm = new TurnCodeVm(boot);
    await Promise.all([vm.run(bash, live()), vm.run(bash, live())]);
    expect(order).toEqual(["start 0", "end 0", "start 1", "end 1"]);
    await vm.close();
  });
});
