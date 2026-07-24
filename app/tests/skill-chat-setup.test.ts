import { deepStrictEqual, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import { isSetupChatMode } from "../src/lib/integration-chat-setup.ts";
import { selectActive, selectArchived } from "../src/lib/mission-selection.ts";
import {
  encodeSkillModifyMessage,
  encodeSkillSetupMessage,
  skillModifyPrompt,
  skillSetupPrompt,
} from "../src/lib/skill-chat-prompts.ts";
import {
  claimedSkillSlug,
  findDraftSkillChatActivities,
  findSkillChatActivity,
  findSkillChatHeal,
  isSkillSetupMode,
  SKILL_SETUP_AGENT_MODE,
} from "../src/lib/skill-chat-setup.ts";

// HOU-791: a custom skill is built and changed in a persistent agent chat
// (the Automations-tab experience), never a raw markdown editor. The kickoff
// is Houston-sent, not user-typed: it must ride the auto-continue marker so
// the transcript hides the bubble and the chat opens with the AGENT's
// greeting.

describe("skill chat setup message", () => {
  it("is tagged as an auto-continue message and filtered from the feed", () => {
    for (const body of [
      encodeSkillSetupMessage("act-1"),
      encodeSkillModifyMessage({
        slug: "weekly-update",
        displayName: "Weekly update",
      }),
    ]) {
      ok(isAutoContinueMessage(body));
      const filtered = filterAutoContinueFeedItems([
        { feed_type: "user_message", data: body },
      ]);
      ok(filtered.length === 0, "kickoff bubble must not render");
    }
  });

  it("carries the kickoff prompt as the model-facing body", () => {
    ok(encodeSkillSetupMessage("act-1").endsWith(skillSetupPrompt("act-1")));
    const skill = { slug: "weekly-update", displayName: "Weekly update" };
    ok(encodeSkillModifyMessage(skill).endsWith(skillModifyPrompt(skill)));
  });

  it("setup chats never surface as missions", () => {
    const setup = {
      id: "s1",
      status: "needs_you",
      agent: SKILL_SETUP_AGENT_MODE,
    };
    const archivedSetup = {
      id: "s2",
      status: "archived",
      agent: SKILL_SETUP_AGENT_MODE,
    };
    const normal = { id: "n1", status: "needs_you", agent: "researcher" };
    const archivedNormal = { id: "n2", status: "archived" };
    ok(isSkillSetupMode(SKILL_SETUP_AGENT_MODE));
    ok(!isSkillSetupMode("researcher"));
    ok(!isSkillSetupMode(null));
    // The ONE shared predicate every board filter uses covers the new kind.
    ok(isSetupChatMode(SKILL_SETUP_AGENT_MODE));
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
        agent: SKILL_SETUP_AGENT_MODE,
      },
      { agent_path: "/w/a", type: "activity", status: "needs_you" },
    ]);
    deepStrictEqual(summaries.a, { needsYouCount: 1, runningCount: 0 });
  });

  it("create kickoff covers the guided interview HOU-791 asks for", () => {
    // Load-bearing beats: the agent opens in a single ask_user call (no
    // wasted greeting turn), batches questions, gates creation on approval,
    // stays non-technical, and links the skill back to this chat via the
    // frontmatter setup_activity_id.
    const prompt = skillSetupPrompt("act-42");
    for (const needle of [
      "The user has not said anything yet",
      "Start RIGHT NOW, in this same turn",
      "SINGLE ask_user call",
      "friendly framing INTO the question",
      "come back to this same chat",
      "A turn that ends without an ask_user call is a mistake",
      "BATCH the questions",
      "as FEW ask_user calls as possible",
      "approval",
      "Never mention files, markdown, JSON, schemas, tools, or field names",
      '"setup_activity_id" set to exactly "act-42"',
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });

  it("modify kickoff greets once, pins the skill, and never duplicates it", () => {
    const prompt = skillModifyPrompt({
      slug: "weekly-update",
      displayName: "Weekly update",
    });
    for (const needle of [
      'skill "Weekly update"',
      "exactly one short, friendly line",
      "do not call ask_user",
      "end your turn after that single line",
      '".agents/skills/weekly-update/"',
      "Never create a second skill",
      "never rename its folder",
      '"setup_activity_id" field if present',
      "approval",
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });

  it("resolves a skill's chat by the durable reverse link first", () => {
    // The forward link (frontmatter setup_activity_id) lives in SKILL.md,
    // which the agent rewrites on every edit — a rewrite that drops it must
    // NOT lose the chat, because the activity's skill_slug stamp survives.
    const chat = {
      id: "a1",
      agent: SKILL_SETUP_AGENT_MODE,
      skill_slug: "weekly-update",
    };
    const other = { id: "a2", agent: "researcher" };
    deepStrictEqual(
      findSkillChatActivity([other, chat], { name: "weekly-update" }),
      chat,
    );
    // Forward link only (agent-created skill, before the heal stamps back).
    const unstamped = { id: "a3", agent: SKILL_SETUP_AGENT_MODE };
    deepStrictEqual(
      findSkillChatActivity([unstamped], {
        name: "research-company",
        setup_activity_id: "a3",
      }),
      unstamped,
    );
    // No link at all → null (a modify chat gets started on open).
    deepStrictEqual(findSkillChatActivity([other], { name: "sin-chat" }), null);
  });

  it("returns ALL live setup chats no skill claims, in input order", () => {
    const draftA = {
      id: "d1",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "running",
    };
    const draftB = {
      id: "d5",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "needs_you",
    };
    // Claimed by a skill's forward link (setup_activity_id).
    const claimedForward = {
      id: "d2",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "done",
    };
    // Claimed by its own skill_slug stamp (the durable reverse link).
    const claimedReverse = {
      id: "d3",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "done",
      skill_slug: "weekly-update",
    };
    const archived = {
      id: "d4",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "archived",
    };
    const normal = { id: "n1", agent: "researcher", status: "running" };
    const skills = [{ name: "s1", setup_activity_id: "d2" }];
    deepStrictEqual(
      findDraftSkillChatActivities(
        [draftA, claimedForward, claimedReverse, archived, normal, draftB],
        skills,
      ),
      [draftA, draftB],
    );
    deepStrictEqual(findDraftSkillChatActivities(undefined, undefined), []);
  });

  it("claim detection: the skill whose forward link names the draft", () => {
    const skills = [
      { name: "s1", setup_activity_id: "other" },
      { name: "s2", setup_activity_id: "d1" },
    ];
    deepStrictEqual(claimedSkillSlug("d1", skills), "s2");
    deepStrictEqual(claimedSkillSlug("dX", skills), null);
    deepStrictEqual(claimedSkillSlug("d1", undefined), null);
  });

  it("link heal: stamps the activity once, then stays quiet", () => {
    // Fresh claim: forward link exists, reverse stamp missing → stamp it.
    deepStrictEqual(
      findSkillChatHeal(
        [{ id: "a1", agent: SKILL_SETUP_AGENT_MODE }],
        [{ name: "weekly-update", setup_activity_id: "a1" }],
      ),
      { kind: "stamp_activity", activityId: "a1", slug: "weekly-update" },
    );
    // Already stamped → nothing to do (the effect loop terminates).
    deepStrictEqual(
      findSkillChatHeal(
        [
          {
            id: "a1",
            agent: SKILL_SETUP_AGENT_MODE,
            skill_slug: "weekly-update",
          },
        ],
        [{ name: "weekly-update", setup_activity_id: "a1" }],
      ),
      null,
    );
    // A stamped activity is never reassigned, even if another skill's
    // forward link points at it.
    deepStrictEqual(
      findSkillChatHeal(
        [{ id: "a1", agent: SKILL_SETUP_AGENT_MODE, skill_slug: "s-old" }],
        [{ name: "s-new", setup_activity_id: "a1" }],
      ),
      null,
    );
    // A forward link to a non-setup activity is ignored.
    deepStrictEqual(
      findSkillChatHeal(
        [{ id: "a1", agent: "researcher" }],
        [{ name: "s1", setup_activity_id: "a1" }],
      ),
      null,
    );
  });
});
