import { deepStrictEqual, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import { selectActive, selectArchived } from "../src/lib/mission-selection.ts";
import {
  encodeRoutineSetupMessage,
  isRoutineSetupMode,
  ROUTINE_SETUP_AGENT_MODE,
  ROUTINE_SETUP_PROMPT,
} from "../src/lib/routine-chat-setup.ts";

// The "Create it in chat" kickoff is Houston-sent, not user-typed: it must
// ride the auto-continue marker so the transcript hides the bubble (live and
// on reload) and the conversation opens with the AGENT's greeting. If the
// marker drifts, non-technical users see raw interview instructions as their
// own first message.

describe("routine chat setup message", () => {
  it("is tagged as an auto-continue message and filtered from the feed", () => {
    const body = encodeRoutineSetupMessage();
    ok(isAutoContinueMessage(body));
    const filtered = filterAutoContinueFeedItems([
      { feed_type: "user_message", data: body },
    ]);
    ok(filtered.length === 0, "kickoff bubble must not render");
  });

  it("carries the kickoff prompt as the model-facing body", () => {
    ok(encodeRoutineSetupMessage().endsWith(ROUTINE_SETUP_PROMPT));
  });

  it("setup chats never surface as missions", () => {
    const setup = {
      id: "s1",
      status: "needs_you",
      agent: ROUTINE_SETUP_AGENT_MODE,
    };
    const archivedSetup = {
      id: "s2",
      status: "archived",
      agent: ROUTINE_SETUP_AGENT_MODE,
    };
    const normal = { id: "n1", status: "needs_you", agent: "researcher" };
    const archivedNormal = { id: "n2", status: "archived" };
    ok(isRoutineSetupMode(ROUTINE_SETUP_AGENT_MODE));
    ok(!isRoutineSetupMode("researcher"));
    ok(!isRoutineSetupMode(null));
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

  it("setup chats never count toward the needs-you badge", () => {
    const agents = [{ id: "a", folderPath: "/w/a" }];
    const summaries = buildAgentActivitySummaries(agents, [
      {
        agent_path: "/w/a",
        type: "activity",
        status: "needs_you",
        agent: ROUTINE_SETUP_AGENT_MODE,
      },
      { agent_path: "/w/a", type: "activity", status: "needs_you" },
    ]);
    deepStrictEqual(summaries.a, { needsYouCount: 1, runningCount: 0 });
  });

  it("kickoff prompt covers the guided interview the issue asks for", () => {
    // Load-bearing beats: the agent opens the conversation, asks exactly one
    // question per ask_user call, covers the chat-mode and quiet-run choices,
    // gates creation on approval, and never quizzes non-technical users
    // about models or providers.
    for (const needle of [
      "The user has not said anything yet",
      "Start RIGHT NOW, in this same turn",
      "one short, friendly opening line",
      "Do not stop after the greeting",
      "a turn that ends without an ask_user call is a mistake",
      "exactly ONE question per ask_user call",
      "Never batch",
      "one ongoing chat",
      "fresh chat",
      "needs their attention",
      "approval",
      "Do not ask about models, providers",
    ]) {
      ok(
        ROUTINE_SETUP_PROMPT.includes(needle),
        `prompt must mention: ${needle}`,
      );
    }
  });
});
