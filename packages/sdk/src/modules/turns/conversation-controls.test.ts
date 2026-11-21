import { expect, test, vi } from "vitest";
import type { ModuleContext } from "../../module-context";
import { createConversationControls } from "./conversation-controls";
import { StreamRegistry, streamKey } from "./stream-registry";

function controls(cancelled: boolean) {
  const cancel = vi.fn(async () => ({ ok: true, cancelled }));
  const commands = new Map<string, (payload: unknown) => unknown>();
  const ctx = {
    clientFor: () => ({ cancel }),
    registerCommand: (name: string, run: (payload: unknown) => unknown) =>
      commands.set(name, run),
    config: {
      baseUrl: "http://host",
      ports: {
        clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      },
    },
  } as unknown as ModuleContext;
  const registry = new StreamRegistry();
  return {
    cancel,
    commands,
    registry,
    controls: createConversationControls(ctx, registry),
  };
}

function waiting(registry: StreamRegistry) {
  const finish = vi.fn();
  const stopUnsent = vi.fn(() => finish);
  registry.set(streamKey("a1", "c1"), {
    kind: "turn",
    dispose: () => {},
    stopUnsent,
  });
  return { finish, stopUnsent };
}

test("cancel is the host's answer, verbatim, even with a send waiting", async () => {
  const { cancel, registry, controls: c } = controls(false);
  const { stopUnsent } = waiting(registry);

  expect(await c.cancel("c1", "a1")).toEqual({ ok: true, cancelled: false });
  expect(cancel).toHaveBeenCalledWith("c1");
  expect(stopUnsent).not.toHaveBeenCalled();
});

test("stopUnsent reaches a send still waiting, and nothing otherwise", () => {
  const { registry, controls: c } = controls(false);
  expect(c.stopUnsent("c1", "a1")).toBeNull();
  const { finish } = waiting(registry);
  expect(c.stopUnsent("c1", "a1")).toBe(finish);
});

test("the turns/cancel command stops a waiting send, then settles it once the engine answered", async () => {
  const { cancel, commands, registry } = controls(false);
  const { finish, stopUnsent } = waiting(registry);

  const answer = await commands.get("turns/cancel")?.({
    conversationId: "c1",
    agentId: "a1",
  });

  expect(answer).toEqual({ ok: true, cancelled: false });
  expect(stopUnsent).toHaveBeenCalledOnce();
  expect(finish).toHaveBeenCalledOnce();
  expect(stopUnsent.mock.invocationCallOrder[0]).toBeLessThan(
    cancel.mock.invocationCallOrder[0] ?? 0,
  );
  expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
    finish.mock.invocationCallOrder[0] ?? 0,
  );
});

test("the turns/cancel command settles the stopped send even when the cancel fails", async () => {
  const { cancel, commands, registry } = controls(false);
  const { finish } = waiting(registry);
  cancel.mockRejectedValueOnce(new Error("Load failed"));

  await expect(
    commands.get("turns/cancel")?.({ conversationId: "c1", agentId: "a1" }),
  ).rejects.toThrow("Load failed");
  expect(finish).toHaveBeenCalledOnce();
});
