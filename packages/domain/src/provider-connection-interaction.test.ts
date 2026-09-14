import type { PendingInteraction } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  saveActivities,
} from "./activities";
import type { TextStore } from "./store";

test("a provider connection survives persistence and clears when its mission closes", async () => {
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
        kind: "provider_connect",
        id: "p1",
        provider: "openai-codex",
        reason: "To use your ChatGPT subscription.",
      },
    ],
  };
  const activity = applyActivityUpdate(
    createActivity({ title: "Connect my accounts" }, "a1", "2026-09-08"),
    { status: "needs_you", pending_interaction: pending },
    "2026-09-08",
  );
  await saveActivities(store, "workspace", [activity]);
  const { items, diagnostics } = await loadActivities(store, "workspace");
  expect(diagnostics).toEqual([]);
  expect(items[0]?.pending_interaction).toEqual(pending);
  const restored = items[0];
  if (!restored) throw new Error("Expected the saved mission to survive");
  expect(
    applyActivityUpdate(restored, { status: "done" }, "2026-09-08")
      .pending_interaction,
  ).toBeUndefined();
});
