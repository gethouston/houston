import { deepStrictEqual, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import { isSetupChatMode } from "../src/lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../src/lib/mission-selection.ts";
import {
  encodeRoutineModifyMessage,
  encodeRoutineSetupMessage,
  routineModifyPrompt,
  routineSetupPrompt,
} from "../src/lib/routine-chat-prompts.ts";
import {
  findDraftSetupActivities,
  findRoutineChatActivity,
  findRoutineChatHeal,
  isRoutineSetupMode,
  REACTION_SETUP_AGENT_MODE,
  ROUTINE_SETUP_AGENT_MODE,
} from "../src/lib/routine-chat-setup.ts";

describe("automation chat setup message", () => {
  it("is tagged as an auto-continue message and filtered from the feed", () => {
    for (const body of [
      encodeRoutineSetupMessage("act-1", null, false),
      encodeRoutineSetupMessage("act-1", null, true),
      encodeRoutineModifyMessage({ id: "r1", name: "Morning brief" }, null),
    ]) {
      ok(isAutoContinueMessage(body));
      const filtered = filterAutoContinueFeedItems([
        { feed_type: "user_message", data: body },
      ]);
      ok(filtered.length === 0, "kickoff bubble must not render");
    }
  });

  it("carries the kickoff prompt as the model-facing body", () => {
    for (const eventsAvailable of [false, true]) {
      ok(
        encodeRoutineSetupMessage("act-1", null, eventsAvailable).endsWith(
          routineSetupPrompt("act-1", null, eventsAvailable),
        ),
      );
    }
    const routine = { id: "r1", name: "Morning brief" };
    ok(
      encodeRoutineModifyMessage(routine, null).endsWith(
        routineModifyPrompt(routine, null),
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
    ok(isRoutineSetupMode(REACTION_SETUP_AGENT_MODE));
    ok(!isRoutineSetupMode("researcher"));
    ok(!isRoutineSetupMode(null));
    ok(isSetupChatMode(ROUTINE_SETUP_AGENT_MODE));
    const missions = [setup, archivedSetup, normal, archivedNormal].filter(
      (m) => !isSetupChatMode(m.agent),
    );
    deepStrictEqual(
      missions.filter((m) => m.status !== ARCHIVED_STATUS).map((m) => m.id),
      ["n1"],
    );
    deepStrictEqual(
      missions.filter((m) => m.status === ARCHIVED_STATUS).map((m) => m.id),
      ["n2"],
    );
  });

  it("setup chats never count toward the needs-you badge", () => {
    const agents = [{ id: "a", folderPath: "/w/a" }];
    const summaries = buildAgentActivitySummaries(
      agents,
      [
        {
          id: "setup",
          agent_path: "/w/a",
          type: "activity",
          status: "needs_you",
          agent: ROUTINE_SETUP_AGENT_MODE,
        },
        {
          id: "real",
          agent_path: "/w/a",
          type: "activity",
          status: "needs_you",
        },
      ],
      () => true,
    );
    deepStrictEqual(summaries.a, {
      needsYouCount: 1,
      runningCount: 0,
      headline: null,
      history: "some",
    });
  });

  it("kickoff prompt covers the guided interview the issue asks for", () => {
    for (const eventsAvailable of [false, true]) {
      const prompt = routineSetupPrompt(
        "act-42",
        [{ id: "anthropic", name: "Claude" }],
        eventsAvailable,
      );
      for (const needle of [
        "The user has not said anything yet",
        "Start RIGHT NOW, in this same turn",
        "SINGLE ask_user call",
        "friendly framing INTO the question",
        "come back to this same chat",
        "A turn that ends without an ask_user call is a mistake",
        "BATCH the questions",
        "as FEW ask_user calls as possible",
        "one ongoing chat",
        "fresh chat",
        "needs their attention",
        "approval",
        "Do not ask about models, providers",
        '"setup_activity_id" field to exactly "act-42"',
      ]) {
        ok(prompt.includes(needle), `prompt must mention: ${needle}`);
      }
    }
  });

  it("offers the event wake only where the deployment supports triggers", () => {
    const scheduleOnly = routineSetupPrompt("act-1", null, false);
    ok(!scheduleOnly.includes("moment something happens"));
    ok(!scheduleOnly.includes("trigger"));
    ok(scheduleOnly.includes("When it should run"));
    ok(scheduleOnly.includes("with the agreed schedule"));

    const both = routineSetupPrompt("act-1", null, true);
    for (const needle of [
      "On a schedule",
      "moment something happens in one of their connected apps",
      "actually connected",
      "help them connect it first",
      "exactly ONE wake mechanism",
    ]) {
      ok(both.includes(needle), `event-capable prompt must mention: ${needle}`);
    }
  });

  it("resolves a routine's chat by the durable reverse link first", () => {
    const chat = {
      id: "a1",
      agent: ROUTINE_SETUP_AGENT_MODE,
      routine_id: "r1",
    };
    const other = { id: "a2", agent: "researcher" };
    deepStrictEqual(findRoutineChatActivity([other, chat], { id: "r1" }), chat);
    const unstamped = { id: "a3", agent: ROUTINE_SETUP_AGENT_MODE };
    deepStrictEqual(
      findRoutineChatActivity([unstamped], {
        id: "r2",
        setup_activity_id: "a3",
      }),
      unstamped,
    );
    deepStrictEqual(findRoutineChatActivity([other], { id: "r3" }), null);
  });

  it("returns ALL live setup chats no routine claims, in input order", () => {
    const draftA = {
      id: "d1",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "running",
    };
    const draftB = {
      id: "d5",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "needs_you",
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
    const normal = { id: "n1", agent: "researcher", status: "running" };
    const routines = [{ id: "r1", setup_activity_id: "d2" }];
    deepStrictEqual(
      findDraftSetupActivities(
        [draftA, claimedForward, claimedReverse, archived, normal, draftB],
        routines,
      ),
      [draftA, draftB],
    );
  });

  it("excludes archived, stamped, forward-claimed, and non-setup chats", () => {
    const routines = [{ id: "r1", setup_activity_id: "fwd" }];
    deepStrictEqual(
      findDraftSetupActivities(
        [
          { id: "a", agent: ROUTINE_SETUP_AGENT_MODE, status: "archived" },
          {
            id: "b",
            agent: ROUTINE_SETUP_AGENT_MODE,
            status: "running",
            routine_id: "r7",
          },
          { id: "fwd", agent: ROUTINE_SETUP_AGENT_MODE, status: "running" },
          { id: "c", agent: "researcher", status: "running" },
        ],
        routines,
      ),
      [],
    );
  });

  it("keeps pre-merge reaction drafts resumable in the merged tab", () => {
    const routineDraft = {
      id: "d1",
      agent: ROUTINE_SETUP_AGENT_MODE,
      status: "running",
    };
    const legacyReactionDraft = {
      id: "d2",
      agent: REACTION_SETUP_AGENT_MODE,
      status: "running",
    };
    deepStrictEqual(
      findDraftSetupActivities([routineDraft, legacyReactionDraft], []),
      [routineDraft, legacyReactionDraft],
    );
  });

  it("returns [] for empty or undefined inputs", () => {
    deepStrictEqual(findDraftSetupActivities([], []), []);
    deepStrictEqual(findDraftSetupActivities(undefined, undefined), []);
    deepStrictEqual(
      findDraftSetupActivities(
        [{ id: "d1", agent: ROUTINE_SETUP_AGENT_MODE, status: "running" }],
        undefined,
      ),
      [{ id: "d1", agent: ROUTINE_SETUP_AGENT_MODE, status: "running" }],
    );
  });

  it("link heal: stamps the activity, then restores an agent-dropped forward link", () => {
    deepStrictEqual(
      findRoutineChatHeal(
        [{ id: "a1", agent: ROUTINE_SETUP_AGENT_MODE }],
        [{ id: "r1", setup_activity_id: "a1" }],
      ),
      { kind: "stamp_activity", activityId: "a1", routineId: "r1" },
    );
    deepStrictEqual(
      findRoutineChatHeal(
        [{ id: "a1", agent: ROUTINE_SETUP_AGENT_MODE, routine_id: "r1" }],
        [{ id: "r1" }],
      ),
      { kind: "stamp_routine", activityId: "a1", routineId: "r1" },
    );
    deepStrictEqual(
      findRoutineChatHeal(
        [{ id: "a1", agent: ROUTINE_SETUP_AGENT_MODE, routine_id: "r1" }],
        [{ id: "r1", setup_activity_id: "a1" }],
      ),
      null,
    );
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

  it("kickoffs name the connected providers so the agent never pins others", () => {
    const connected = [
      { id: "anthropic", name: "Claude" },
      { id: "openai", name: "ChatGPT" },
    ];
    for (const prompt of [
      routineSetupPrompt("act-1", connected, false),
      routineSetupPrompt("act-1", connected, true),
      routineModifyPrompt({ id: "r1", name: "R" }, connected),
    ]) {
      ok(
        prompt.includes(
          'the only providers connected for this user are: "anthropic" (Claude), "openai" (ChatGPT)',
        ),
      );
      ok(prompt.includes("do NOT set it"));
      ok(prompt.includes("Never invent provider or model names"));
    }
    const unknown = routineSetupPrompt("act-1", null, false);
    ok(unknown.includes("cannot confirm it is connected"));
    ok(!unknown.includes("only providers connected"));
  });

  it("modify kickoff greets once, pins the routine, and keeps its wake", () => {
    const prompt = routineModifyPrompt({ id: "r-7", name: "Morning brief" }, [
      { id: "anthropic", name: "Claude" },
    ]);
    for (const needle of [
      'routine "Morning brief"',
      "exactly one short, friendly line",
      "do not call ask_user",
      "end your turn after that single line",
      'id is "r-7"',
      "Never create a second one",
      "keep how it wakes",
      "exactly ONE wake mechanism",
      "approval",
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });
});
