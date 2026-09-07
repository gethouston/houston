import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveOpenConversation } from "../src/components/board/open-conversation-identity.ts";

const card = {
  id: "hola",
  metadata: { sessionKey: "activity-hola", agentPath: "Personal/O1" },
};
const routineCard = {
  id: "digest",
  metadata: { sessionKey: "routine-digest", agentPath: "Personal/CEO" },
};
const legacyCard = { id: "legacy", metadata: { agentPath: "Personal/O1" } };

describe("resolveOpenConversation", () => {
  it("reads the selected card first", () => {
    deepStrictEqual(
      resolveOpenConversation({
        selectedId: "digest",
        selectedItem: routineCard,
        created: {
          activityId: "digest",
          agentPath: "elsewhere",
          sessionKey: "activity-digest",
        },
        lastResolved: null,
      }),
      {
        activityId: "digest",
        sessionKey: "routine-digest",
        agentPath: "Personal/CEO",
      },
    );
  });

  it("derives activity-{id} for a legacy card without a stored session key", () => {
    deepStrictEqual(
      resolveOpenConversation({
        selectedId: "legacy",
        selectedItem: legacyCard,
        created: null,
        lastResolved: null,
      }),
      {
        activityId: "legacy",
        sessionKey: "activity-legacy",
        agentPath: "Personal/O1",
      },
    );
  });

  it("falls back to the just-created mission before its row lands", () => {
    deepStrictEqual(
      resolveOpenConversation({
        selectedId: "hola",
        selectedItem: null,
        created: {
          activityId: "hola",
          agentPath: "Personal/O1",
          sessionKey: "activity-hola",
        },
        lastResolved: null,
      }),
      {
        activityId: "hola",
        sessionKey: "activity-hola",
        agentPath: "Personal/O1",
      },
    );
  });

  it("keeps the last resolved identity while the card is transiently absent", () => {
    const resolved = resolveOpenConversation({
      selectedId: "hola",
      selectedItem: card,
      created: null,
      lastResolved: null,
    });
    // A stale sweep settled and the card fell out of the list for a beat.
    deepStrictEqual(
      resolveOpenConversation({
        selectedId: "hola",
        selectedItem: null,
        created: null,
        lastResolved: resolved,
      }),
      resolved,
    );
  });

  it("never reuses an identity resolved for another selection", () => {
    strictEqual(
      resolveOpenConversation({
        selectedId: "other",
        selectedItem: null,
        created: null,
        lastResolved: {
          activityId: "hola",
          sessionKey: "activity-hola",
          agentPath: "Personal/O1",
        },
      }),
      null,
    );
  });

  it("resolves nothing without a selection", () => {
    strictEqual(
      resolveOpenConversation({
        selectedId: null,
        selectedItem: null,
        created: null,
        lastResolved: {
          activityId: "hola",
          sessionKey: "activity-hola",
          agentPath: "Personal/O1",
        },
      }),
      null,
    );
  });
});
