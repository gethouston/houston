import { deepStrictEqual, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import {
  encodeIntegrationSetupMessage,
  findDraftIntegrationSetupActivity,
  INTEGRATION_SETUP_AGENT_MODE,
  integrationSetupPrompt,
  isIntegrationSetupMode,
  isSetupChatMode,
} from "../src/lib/integration-chat-setup.ts";
import { selectActive, selectArchived } from "../src/lib/mission-selection.ts";
import { ROUTINE_SETUP_AGENT_MODE } from "../src/lib/routine-chat-setup.ts";

// The custom-integration kickoff is Houston-sent, not user-typed: it must ride
// the auto-continue marker so the transcript hides the bubble (live and on
// reload) and the conversation opens with the AGENT's greeting.

describe("integration chat setup message", () => {
  it("is tagged as an auto-continue message and filtered from the feed", () => {
    const body = encodeIntegrationSetupMessage();
    ok(isAutoContinueMessage(body));
    const filtered = filterAutoContinueFeedItems([
      { feed_type: "user_message", data: body },
    ]);
    ok(filtered.length === 0, "kickoff bubble must not render");
  });

  it("carries the kickoff prompt as the model-facing body", () => {
    ok(encodeIntegrationSetupMessage().endsWith(integrationSetupPrompt()));
  });

  it("kickoff opens the interview and stays plain-language", () => {
    const prompt = integrationSetupPrompt();
    for (const needle of [
      "Add custom integration",
      "The user has not said anything yet",
      "Start RIGHT NOW, in this same turn",
      "one short, friendly opening line",
      "call the ask_user tool",
      "a turn that ends without an ask_user call is a mistake",
      "request_credential",
      "NEVER ask the user to paste a key",
      "exactly ONE question per ask_user call",
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });

  it("recognizes the integration sentinel, and both sentinels as setup chats", () => {
    ok(isIntegrationSetupMode(INTEGRATION_SETUP_AGENT_MODE));
    ok(!isIntegrationSetupMode(ROUTINE_SETUP_AGENT_MODE));
    ok(!isIntegrationSetupMode(null));
    // The combined predicate every board filter uses covers BOTH kinds.
    ok(isSetupChatMode(INTEGRATION_SETUP_AGENT_MODE));
    ok(isSetupChatMode(ROUTINE_SETUP_AGENT_MODE));
    ok(!isSetupChatMode("researcher"));
    ok(!isSetupChatMode(null));
  });

  it("integration-setup chats never surface as missions", () => {
    const setup = {
      id: "s1",
      status: "needs_you",
      agent: INTEGRATION_SETUP_AGENT_MODE,
    };
    const archivedSetup = {
      id: "s2",
      status: "archived",
      agent: INTEGRATION_SETUP_AGENT_MODE,
    };
    const normal = { id: "n1", status: "needs_you", agent: "researcher" };
    const archivedNormal = { id: "n2", status: "archived" };
    // Active board: only the normal mission survives.
    deepStrictEqual(
      selectActive([setup, archivedSetup, normal, archivedNormal]).map(
        (i) => i.id,
      ),
      ["n1"],
    );
    // Archived tab: closed setup chats stay invisible too.
    deepStrictEqual(
      selectArchived([setup, archivedSetup, normal, archivedNormal]).map(
        (i) => i.id,
      ),
      ["n2"],
    );
  });

  it("finds the one live draft: an integration-setup chat that is not archived", () => {
    const draft = {
      id: "d1",
      agent: INTEGRATION_SETUP_AGENT_MODE,
      status: "running",
    };
    const archived = {
      id: "d2",
      agent: INTEGRATION_SETUP_AGENT_MODE,
      status: "archived",
    };
    const routineChat = {
      id: "d3",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "running",
    };
    const normal = { id: "d4", agent: "researcher", status: "needs_you" };
    // The archived draft, the routine chat, and the normal mission are all
    // skipped; only the live integration draft is returned.
    deepStrictEqual(
      findDraftIntegrationSetupActivity([archived, routineChat, normal, draft]),
      draft,
    );
    deepStrictEqual(
      findDraftIntegrationSetupActivity([archived, routineChat, normal]),
      undefined,
    );
    deepStrictEqual(findDraftIntegrationSetupActivity(undefined), undefined);
  });
});
