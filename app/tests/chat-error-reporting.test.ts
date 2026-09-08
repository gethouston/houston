import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { reportRejection } from "../src/lib/report-rejection.ts";

/**
 * A9: background work started by a component reports its failures.
 *
 * The failure mode is silence — a fire-and-forget write whose rejection reaches
 * nothing (or only a `console.error`, which no crash report ever sees). The
 * chat panel's four background writes (the agent-config read, the last-used
 * provider read, the conversation model pin, the last-model save) all run
 * through this one rule, so the rule is what is tested: reject, and the
 * reporter hears about it, named.
 */

const reported: { command: string; err: unknown }[] = [];
const report = (command: string, err: unknown) =>
  void reported.push({ command, err });

test("a rejected background write reaches the reporter, named", async () => {
  reported.length = 0;
  const boom = new Error("the config could not be read");
  reportRejection(Promise.reject(boom), "chat.read-agent-model", report);
  await Promise.resolve();

  deepStrictEqual(reported, [{ command: "chat.read-agent-model", err: boom }]);
});

test("a rejection thrown mid-chain is reported too, not just the first link", async () => {
  reported.length = 0;
  const boom = new Error("the state update blew up");
  reportRejection(
    Promise.resolve("ok").then(() => {
      throw boom;
    }),
    "chat.pin-conversation-model",
    report,
  );
  await Promise.resolve();
  await Promise.resolve();

  deepStrictEqual(reported, [
    { command: "chat.pin-conversation-model", err: boom },
  ]);
});

test("work that succeeds reports nothing", async () => {
  reported.length = 0;
  reportRejection(Promise.resolve("fine"), "chat.save-last-model", report);
  await Promise.resolve();

  strictEqual(reported.length, 0);
});

test("a rejection never escapes as an unhandled one", async () => {
  reported.length = 0;
  const unhandled: unknown[] = [];
  const onUnhandled = (err: unknown) => void unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    reportRejection(Promise.reject(new Error("x")), "chat.x", report);
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }

  strictEqual(unhandled.length, 0);
  strictEqual(reported.length, 1);
});
