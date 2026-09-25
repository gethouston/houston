import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  armFirstMessage,
  createFirstMessageTracker,
  type FirstMessageState,
  type FirstMessageTrackerDeps,
  parseFirstMessageState,
  shouldArmFirstMessage,
} from "../src/lib/first-message-sent.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(opts: { stored: FirstMessageState; readFails?: boolean }) {
  const calls = { reads: 0, writes: 0, tracks: 0, errors: [] as string[] };
  let stored = opts.stored;
  let readFails = opts.readFails ?? false;
  const deps: FirstMessageTrackerDeps = {
    readState: async () => {
      calls.reads += 1;
      if (readFails) throw new Error("host unreachable");
      return stored;
    },
    writeSent: async () => {
      calls.writes += 1;
      stored = "sent";
    },
    track: () => {
      calls.tracks += 1;
    },
    onError: (command) => {
      calls.errors.push(command);
    },
  };
  const tracker = createFirstMessageTracker(deps);
  return {
    calls,
    listener: tracker.listener,
    dispose: tracker.dispose,
    heal: () => {
      readFails = false;
    },
  };
}

describe("parseFirstMessageState", () => {
  it("reads the stored values", () => {
    strictEqual(parseFirstMessageState("armed"), "armed");
    strictEqual(parseFirstMessageState("1"), "sent");
    strictEqual(parseFirstMessageState(" 1 "), "sent");
  });

  it("reads absent or unknown values as unarmed", () => {
    strictEqual(parseFirstMessageState(null), "unarmed");
    strictEqual(parseFirstMessageState(""), "unarmed");
    strictEqual(parseFirstMessageState("yes"), "unarmed");
  });
});

describe("arming", () => {
  it("arms only an account that never armed", () => {
    strictEqual(shouldArmFirstMessage("unarmed"), true);
    strictEqual(shouldArmFirstMessage("armed"), false);
    strictEqual(shouldArmFirstMessage("sent"), false);
  });

  it("writes armed once and never downgrades a sent account", async () => {
    for (const [state, expected] of [
      ["unarmed", 1],
      ["armed", 0],
      ["sent", 0],
    ] as const) {
      let writes = 0;
      await armFirstMessage({
        readState: async () => state,
        writeArmed: async () => {
          writes += 1;
        },
      });
      strictEqual(writes, expected, state);
    }
  });
});

describe("createFirstMessageTracker", () => {
  it("reports an armed account's first message once and stores it", async () => {
    const h = harness({ stored: "armed" });
    h.listener("chat_message_sent");
    h.listener("chat_message_sent");
    await flush();
    h.listener("chat_message_sent");
    await flush();
    strictEqual(h.calls.tracks, 1);
    strictEqual(h.calls.writes, 1);
    strictEqual(h.calls.reads, 1);
  });

  it("an account that never started the first-run onboarding stays silent", async () => {
    const h = harness({ stored: "unarmed" });
    h.listener("chat_message_sent");
    await flush();
    strictEqual(h.calls.tracks, 0);
    strictEqual(h.calls.writes, 0);
  });

  it("an account that already reported never reports again", async () => {
    const h = harness({ stored: "sent" });
    h.listener("chat_message_sent");
    await flush();
    strictEqual(h.calls.tracks, 0);
    strictEqual(h.calls.writes, 0);
  });

  it("ignores every other event", async () => {
    const h = harness({ stored: "armed" });
    h.listener("mission_created");
    await flush();
    strictEqual(h.calls.reads, 0);
    strictEqual(h.calls.tracks, 0);
  });

  it("a failed read reports, stays silent, and retries on the next send", async () => {
    const h = harness({ stored: "armed", readFails: true });
    h.listener("chat_message_sent");
    await flush();
    strictEqual(h.calls.tracks, 0);
    deepStrictEqual(h.calls.errors, ["first_message_sent_read"]);
    h.heal();
    h.listener("chat_message_sent");
    await flush();
    strictEqual(h.calls.tracks, 1);
  });

  it("a read that resolves after the account changed reports and writes nothing", async () => {
    const h = harness({ stored: "armed" });
    h.listener("chat_message_sent");
    h.dispose();
    await flush();
    strictEqual(h.calls.reads, 1);
    strictEqual(h.calls.tracks, 0);
    strictEqual(h.calls.writes, 0);
  });

  it("a disposed tracker ignores later sends", async () => {
    const h = harness({ stored: "armed" });
    h.dispose();
    h.listener("chat_message_sent");
    await flush();
    strictEqual(h.calls.reads, 0);
    strictEqual(h.calls.tracks, 0);
  });
});
