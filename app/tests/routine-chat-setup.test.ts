import { deepStrictEqual, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import { selectActive, selectArchived } from "../src/lib/mission-selection.ts";
import {
  encodeRoutineModifyMessage,
  encodeRoutineSetupMessage,
  findDraftSetupActivity,
  findRoutineChatActivity,
  findRoutineChatHeal,
  isRoutineSetupMode,
  ROUTINE_SETUP_AGENT_MODE,
  routineModifyPrompt,
  routineSetupPrompt,
} from "../src/lib/routine-chat-setup.ts";

// The "Create it in chat" kickoff is Houston-sent, not user-typed: it must
// ride the auto-continue marker so the transcript hides the bubble (live and
// on reload) and the conversation opens with the AGENT's greeting. If the
// marker drifts, non-technical users see raw interview instructions as their
// own first message.

describe("routine chat setup message", () => {
  it("is tagged as an auto-continue message and filtered from the feed", () => {
    for (const body of [
      encodeRoutineSetupMessage("act-1"),
      encodeRoutineModifyMessage({ id: "r1", name: "Morning brief" }),
    ]) {
      ok(isAutoContinueMessage(body));
      const filtered = filterAutoContinueFeedItems([
        { feed_type: "user_message", data: body },
      ]);
      ok(filtered.length === 0, "kickoff bubble must not render");
    }
  });

  it("carries the kickoff prompt as the model-facing body", () => {
    ok(
      encodeRoutineSetupMessage("act-1").endsWith(routineSetupPrompt("act-1")),
    );
    const routine = { id: "r1", name: "Morning brief" };
    ok(
      encodeRoutineModifyMessage(routine).endsWith(
        routineModifyPrompt(routine),
      ),
    );
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
    // about models or providers. HOU-725 adds the persistence beats: the
    // greeting says the chat stays available for later changes, and the
    // routine is linked back to this chat via setup_activity_id.
    const prompt = routineSetupPrompt("act-42");
    for (const needle of [
      "The user has not said anything yet",
      "Start RIGHT NOW, in this same turn",
      "one short, friendly opening line",
      "come back to this same chat",
      "Do not stop after the greeting",
      "a turn that ends without an ask_user call is a mistake",
      "exactly ONE question per ask_user call",
      "Never batch",
      "one ongoing chat",
      "fresh chat",
      "needs their attention",
      "approval",
      "Do not ask about models, providers",
      '"setup_activity_id" field to exactly "act-42"',
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });

  it("resolves a routine's chat by the durable reverse link first", () => {
    // The forward link (routine.setup_activity_id) lives in routines.json,
    // which the agent rewrites — an edit that drops it must NOT lose the
    // chat, because the activity's routine_id stamp survives.
    const chat = {
      id: "a1",
      agent: ROUTINE_SETUP_AGENT_MODE,
      routine_id: "r1",
    };
    const other = { id: "a2", agent: "researcher" };
    // Forward link dropped → reverse link still finds it.
    deepStrictEqual(findRoutineChatActivity([other, chat], { id: "r1" }), chat);
    // Forward link only (agent-created routine, before the heal stamps back).
    const unstamped = { id: "a3", agent: ROUTINE_SETUP_AGENT_MODE };
    deepStrictEqual(
      findRoutineChatActivity([unstamped], {
        id: "r2",
        setup_activity_id: "a3",
      }),
      unstamped,
    );
    // No link at all → null (a modify chat gets started on open).
    deepStrictEqual(findRoutineChatActivity([other], { id: "r3" }), null);
  });

  it("a draft is a setup chat no routine claims in either direction", () => {
    const draft = {
      id: "d1",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "running",
    };
    const claimedForward = {
      id: "d2",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "done",
    };
    const claimedReverse = {
      id: "d3",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "done",
      routine_id: "r9",
    };
    const archived = {
      id: "d4",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "archived",
    };
    const routines = [{ id: "r1", setup_activity_id: "d2" }];
    deepStrictEqual(
      findDraftSetupActivity(
        [claimedForward, claimedReverse, archived, draft],
        routines,
      ),
      draft,
    );
    deepStrictEqual(
      findDraftSetupActivity([claimedForward], routines),
      undefined,
    );
  });

  it("link heal: stamps the activity, then restores an agent-dropped forward link", () => {
    // Fresh claim: forward link exists, reverse stamp missing → stamp activity.
    deepStrictEqual(
      findRoutineChatHeal(
        [{ id: "a1", agent: ROUTINE_SETUP_AGENT_MODE }],
        [{ id: "r1", setup_activity_id: "a1" }],
      ),
      { kind: "stamp_activity", activityId: "a1", routineId: "r1" },
    );
    // The reported bug (HOU-725 follow-up): the agent rewrote the routine and
    // dropped setup_activity_id → restore it from the activity's stamp.
    deepStrictEqual(
      findRoutineChatHeal(
        [{ id: "a1", agent: ROUTINE_SETUP_AGENT_MODE, routine_id: "r1" }],
        [{ id: "r1" }],
      ),
      { kind: "stamp_routine", activityId: "a1", routineId: "r1" },
    );
    // Consistent both ways → nothing to do (the effect loop terminates).
    deepStrictEqual(
      findRoutineChatHeal(
        [{ id: "a1", agent: ROUTINE_SETUP_AGENT_MODE, routine_id: "r1" }],
        [{ id: "r1", setup_activity_id: "a1" }],
      ),
      null,
    );
    // A valid forward link to a DIFFERENT chat is never overwritten by a
    // stale reverse stamp — no flip-flop between two claimants.
    deepStrictEqual(
      findRoutineChatHeal(
        [
          { id: "a1", agent: ROUTINE_SETUP_AGENT_MODE, routine_id: "r1" },
          { id: "a2", agent: ROUTINE_SETUP_AGENT_MODE, routine_id: "r1" },
        ],
        [{ id: "r1", setup_activity_id: "a2" }],
      ),
      null,
    );
  });

  it("modify kickoff greets once and pins the routine it may edit", () => {
    // The routine already exists: no interview, exactly one greeting line,
    // and every later edit targets THIS routine (never a duplicate).
    const prompt = routineModifyPrompt({ id: "r-7", name: "Morning brief" });
    for (const needle of [
      'routine "Morning brief"',
      "exactly one short, friendly line",
      "do not call ask_user",
      "end your turn after that single line",
      'id is "r-7"',
      "Never create a second routine",
      "approval",
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });
});
