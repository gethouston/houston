import type { PendingInteraction } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  saveActivities,
} from "./activities";
import type { TextStore } from "./store";

test("a hands-on errand survives persistence and clears when its mission closes", async () => {
  const documents = new Map<string, string>();
  const store: TextStore = {
    async readText(key) {
      return documents.get(key) ?? null;
    },
    async writeText(key, value) {
      documents.set(key, value);
    },
  };
  const pending: PendingInteraction = {
    steps: [
      { kind: "connect", id: "c1", toolkit: "gmail" },
      {
        kind: "hands_on",
        id: "h1",
        surface: "routineWebhook",
        reason: "Copy the webhook Houston shows you once.",
        target: "routine-7",
      },
    ],
  };
  const activity = applyActivityUpdate(
    createActivity({ title: "Wire up the nightly report" }, "a1", "2026-09-14"),
    { status: "needs_you", pending_interaction: pending },
    "2026-09-14",
  );
  await saveActivities(store, "workspace", [activity]);
  const { items, diagnostics } = await loadActivities(store, "workspace");
  expect(diagnostics).toEqual([]);
  // Stored VERBATIM, `target` included: the app opens the screen focused on it.
  expect(items[0]?.pending_interaction).toEqual(pending);
  const restored = items[0];
  if (!restored) throw new Error("Expected the saved mission to survive");
  // An errand is BLOCKING, so closing the mission by hand voids it exactly as
  // it voids a connect step: a Done card never shows a card asking for more.
  expect(
    applyActivityUpdate(restored, { status: "done" }, "2026-09-14")
      .pending_interaction,
  ).toBeUndefined();
});
