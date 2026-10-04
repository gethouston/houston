import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston/engine-adapter";
import { DraftPrewarm } from "@houston/sdk/draft-prewarm";
import {
  type ComposerTarget,
  composerDraft,
  createComposerPrewarm,
} from "../src/lib/composer-prewarm.ts";
import { newMissionIds } from "../src/lib/new-mission-ids.ts";
import { newConversationDraftKey } from "../src/stores/drafts.ts";

const SLOT = newConversationDraftKey("board-a");
const TARGET: ComposerTarget = {
  agentPath: "sales",
  newConversationKey: SLOT,
  provider: "anthropic",
  model: "claude-sonnet-4-6",
};
const ON: Capabilities = { conversationPrewarm: true } as Capabilities;

/** The composer over the SDK's real typing policy and a recording prewarm. */
function harness(capabilities: Capabilities | undefined, failWith?: Error) {
  const prewarmed: { conversationId: string; agentId: string }[] = [];
  const reported: [string, unknown][] = [];
  let minted = 0;
  const policy = new DraftPrewarm({
    prewarm: async (conversationId, agentId) => {
      prewarmed.push({ conversationId, agentId });
      if (failWith) throw failWith;
    },
    now: () => 0,
    mintId: () => `u-${++minted}`,
  });
  const composer = createComposerPrewarm({
    engine: () => ({
      draftChanged: (draft, caps) => policy.draftChanged(draft, caps),
      claimNewConversationId: (key) => policy.claimNewConversationId(key),
    }),
    capabilities: () => capabilities,
    report: (command, err) => reported.push([command, err]),
  });
  return { composer, prewarmed, reported };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

const source = (path: string): string =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("the composer's draft", () => {
  it("an open chat's key is its conversation id", () => {
    deepStrictEqual(composerDraft("activity-c1", "hi", TARGET), {
      agentId: "sales",
      draftKey: "activity-c1",
      conversationId: "activity-c1",
      text: "hi",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("a new chat goes out under the scoped slot with no id", () => {
    const draft = composerDraft("new-conversation", "hi", TARGET);
    strictEqual(draft?.draftKey, SLOT);
    strictEqual(draft !== null && "conversationId" in draft, false);
  });

  it("no agent means no draft", () => {
    strictEqual(
      composerDraft("new-conversation", "hi", { ...TARGET, agentPath: null }),
      null,
    );
  });
});

describe("warm while typing", () => {
  it("a deployment without the capability is asked nothing", async () => {
    const { composer, prewarmed, reported } = harness(undefined);
    composer.draftChanged("activity-c1", "hello", TARGET);
    composer.draftChanged("new-conversation", "hello", TARGET);
    await settled();
    deepStrictEqual(prewarmed, []);
    deepStrictEqual(reported, []);
  });

  it("a new chat's first send uses the id its typing prewarmed", async () => {
    const { composer, prewarmed } = harness(ON);
    composer.draftChanged("new-conversation", "h", TARGET);
    await settled();
    const claimed = composer.claimNewConversationId(SLOT);
    const mission = newMissionIds(claimed);
    deepStrictEqual(prewarmed, [
      { conversationId: mission.sessionKey, agentId: "sales" },
    ]);
    strictEqual(mission.conversationId, claimed);
  });

  it("a failed prewarm is reported, never thrown", async () => {
    const boom = new Error("gateway said no");
    const { composer, reported } = harness(ON, boom);
    composer.draftChanged("activity-c1", "hello", TARGET);
    await settled();
    deepStrictEqual(reported, [["prewarm_conversation", boom]]);
  });
});

describe("the claimed id reaches the mission", () => {
  it("a fresh id when nothing was prewarmed", () => {
    const { conversationId, sessionKey } = newMissionIds(undefined);
    ok(conversationId.length > 0);
    strictEqual(sessionKey, `activity-${conversationId}`);
  });

  it("every client-minted create and every new-chat path forwards it", () => {
    for (const file of [
      "lib/create-mission-now.ts",
      "lib/create-mission-warming.ts",
    ])
      ok(
        /newMissionIds\(opts\.conversationId\)/.test(source(file)),
        `${file} must mint through newMissionIds`,
      );
    ok(
      /conversationId: prewarm\.claimNewConversationId\(\)/.test(
        source("components/board/use-board-chat-wiring.tsx"),
      ),
    );
    ok(
      /conversationId: claimedId/.test(
        source("components/board/board-create-conversation.ts"),
      ),
    );
    ok(
      /conversationId: opts\?\.conversationId/.test(
        source("components/use-mission-control.ts"),
      ),
    );
  });
});
