import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createSendPinGate,
  type SendPinSignals,
  sendPinSettled,
} from "../src/lib/send-pin-gate.ts";

const allSettled: SendPinSignals = {
  agentConfigSettled: true,
  activitySettled: true,
  capabilitiesSettled: true,
  choiceSettled: true,
  statusesSettled: true,
};

describe("sendPinSettled", () => {
  it("is true only when every input has landed", () => {
    strictEqual(sendPinSettled(allSettled), true);
  });

  for (const key of Object.keys(allSettled) as (keyof SendPinSignals)[]) {
    it(`waits while ${key} is still pending`, () => {
      strictEqual(sendPinSettled({ ...allSettled, [key]: false }), false);
    });
  }
});

/** A manual clock so the timeout path is exercised without real timers. */
function fakeTimers() {
  const timers = new Map<number, () => void>();
  let next = 1;
  return {
    set: (cb: () => void, _ms: number) => {
      const id = next++;
      timers.set(id, cb);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear: (id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    },
    fire: () => {
      for (const [id, cb] of [...timers]) {
        timers.delete(id);
        cb();
      }
    },
    pending: () => timers.size,
  };
}

describe("createSendPinGate", () => {
  it("answers immediately with the latest pin once settled", async () => {
    const gate = createSendPinGate({ provider: "guess", model: "" });
    gate.update({ provider: "anthropic", model: "claude-opus-5" }, true);
    deepStrictEqual(await gate.resolve(), {
      provider: "anthropic",
      model: "claude-opus-5",
    });
  });

  it("holds a send while resolving and releases it with the SETTLED pin, never the guess", async () => {
    const clock = fakeTimers();
    const gate = createSendPinGate(
      { provider: "openai-compatible", model: "" },
      undefined,
      clock.set,
      clock.clear,
    );
    gate.update({ provider: "openai-compatible", model: "" }, false);
    let released: { provider: string; model: string } | undefined;
    const waiting = gate.resolve().then((pin) => {
      released = pin;
    });
    await Promise.resolve();
    strictEqual(released, undefined);
    // The row lands: the composer settles on the chat's real pin.
    gate.update({ provider: "anthropic", model: "claude-opus-5" }, true);
    await waiting;
    deepStrictEqual(released, {
      provider: "anthropic",
      model: "claude-opus-5",
    });
    // The settle cancelled the timeout: nothing left to fire.
    strictEqual(clock.pending(), 0);
  });

  it("releases every waiting send on one settle", async () => {
    const clock = fakeTimers();
    const gate = createSendPinGate(
      { provider: "guess", model: "" },
      undefined,
      clock.set,
      clock.clear,
    );
    const both = Promise.all([gate.resolve(), gate.resolve()]);
    gate.update({ provider: "openai", model: "gpt-6-astra" }, true);
    deepStrictEqual(await both, [
      { provider: "openai", model: "gpt-6-astra" },
      { provider: "openai", model: "gpt-6-astra" },
    ]);
  });

  it("gives up after the timeout with the best pin it has, and says so", async () => {
    const clock = fakeTimers();
    let timedOut = 0;
    const gate = createSendPinGate(
      { provider: "anthropic", model: "claude-sonnet-5" },
      () => {
        timedOut += 1;
      },
      clock.set,
      clock.clear,
    );
    const waiting = gate.resolve(1_000);
    gate.update({ provider: "anthropic", model: "claude-opus-5" }, false);
    clock.fire();
    deepStrictEqual(await waiting, {
      provider: "anthropic",
      model: "claude-opus-5",
    });
    strictEqual(timedOut, 1);
    // A later settle must not wake a waiter that already gave up.
    gate.update({ provider: "openai", model: "gpt-6-astra" }, true);
    strictEqual(timedOut, 1);
  });

  it("a settle that later un-settles holds the NEXT send again", async () => {
    const clock = fakeTimers();
    const gate = createSendPinGate(
      { provider: "a", model: "1" },
      undefined,
      clock.set,
      clock.clear,
    );
    gate.update({ provider: "a", model: "1" }, true);
    deepStrictEqual(await gate.resolve(), { provider: "a", model: "1" });
    gate.update({ provider: "b", model: "2" }, false);
    let released = false;
    const waiting = gate.resolve().then(() => {
      released = true;
    });
    await Promise.resolve();
    strictEqual(released, false);
    gate.update({ provider: "b", model: "2" }, true);
    await waiting;
    strictEqual(released, true);
  });
});
