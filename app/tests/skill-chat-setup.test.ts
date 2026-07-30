import { deepStrictEqual, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";
import { buildAttachmentPrompt } from "../src/lib/attachment-message.ts";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import { skillDisplayTitle } from "../src/lib/humanize-skill-name.ts";
import { isSetupChatMode } from "../src/lib/integration-chat-setup.ts";
import { selectActive, selectArchived } from "../src/lib/mission-selection.ts";
import {
  encodeSkillModifyMessage,
  encodeSkillSetupMessage,
  skillChatTurnContext,
  skillModifyPrompt,
  skillSetupPrompt,
} from "../src/lib/skill-chat-prompts.ts";
import {
  claimedSkillSlug,
  claimNewlyCreatedSkill,
  findDraftSkillChatActivities,
  findSkillChatActivity,
  findSkillChatHeal,
  findSkillChatTitleHeal,
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
    deepStrictEqual(summaries.a, {
      needsYouCount: 1,
      runningCount: 0,
      unreadCount: 0,
    });
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
      // Location by lookup, not a hardcoded path: the skill may live in the
      // workspace's shared library, and the model's own skills list carries
      // the real location either way.
      'named "weekly-update" in your skills list',
      "edit that file where it is",
      "Never create a second skill",
      // Structure awareness: a rename means the display title, never the
      // folder/name identity (renaming those breaks how Houston finds it).
      "DISPLAY NAME",
      'means changing "title"',
      "NEVER rename or move the folder",
      'never change "name"',
      '"description" is the one-line card text',
      "step-by-step procedure",
      '"setup_activity_id" field exactly as it is',
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

  it("heal adopts a title-matched orphan chat back onto its chatless skill", () => {
    // The reported bug: "Meeting prep" installed AND showing as a draft —
    // the modify chat was created (titled with the skill's display name) but
    // the link stamp never landed. The heal stamps it back.
    const orphan = {
      id: "a1",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "done",
      title: "Meeting prep",
    };
    deepStrictEqual(
      findSkillChatHeal(
        [orphan],
        [{ name: "meeting-prep" }],
        skillDisplayTitle,
      ),
      { kind: "stamp_activity", activityId: "a1", slug: "meeting-prep" },
    );
    // Frontmatter title wins over the humanized slug, same as everywhere.
    deepStrictEqual(
      findSkillChatHeal(
        [{ ...orphan, title: "Preparar reunión" }],
        [{ name: "preparar-reunion", title: "Preparar reunión" }],
        skillDisplayTitle,
      ),
      {
        kind: "stamp_activity",
        activityId: "a1",
        slug: "preparar-reunion",
      },
    );
    // Ambiguous (two skills share the display title) → never guess.
    deepStrictEqual(
      findSkillChatHeal(
        [orphan],
        [
          { name: "meeting-prep" },
          { name: "meeting-prep-2", title: "Meeting prep" },
        ],
        skillDisplayTitle,
      ),
      null,
    );
    // The skill already has its own chat → the orphan stays a draft.
    deepStrictEqual(
      findSkillChatHeal(
        [
          orphan,
          {
            id: "a2",
            agent: SKILL_SETUP_AGENT_MODE,
            skill_slug: "meeting-prep",
          },
        ],
        [{ name: "meeting-prep" }],
        skillDisplayTitle,
      ),
      null,
    );
    // A create-flow draft ("New skill") matches no skill → untouched, and
    // without the resolver rule 2 never runs.
    deepStrictEqual(
      findSkillChatHeal(
        [{ ...orphan, title: "New skill" }],
        [{ name: "meeting-prep" }],
        skillDisplayTitle,
      ),
      null,
    );
    deepStrictEqual(
      findSkillChatHeal([orphan], [{ name: "meeting-prep" }]),
      null,
    );
  });

  it("fallback claim: the one new, linkless, chatless skill wins the draft", () => {
    const prev = new Set(["existing"]);
    const acts = [{ id: "d1", agent: SKILL_SETUP_AGENT_MODE }];
    // One arrival, no forward link, no chat → claimed.
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "existing" }, { name: "meeting-prep" }],
        acts,
      ),
      "meeting-prep",
    );
    // An arrival that DID link itself is the normal claim path, not this one.
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "meeting-prep", setup_activity_id: "d1" }],
        acts,
      ),
      null,
    );
    // Two ambiguous arrivals → never guess.
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "a-skill" }, { name: "b-skill" }],
        acts,
      ),
      null,
    );
    // An arrival whose chat already exists (stamped elsewhere) is not free.
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "meeting-prep" }],
        [
          {
            id: "a9",
            agent: SKILL_SETUP_AGENT_MODE,
            skill_slug: "meeting-prep",
          },
        ],
      ),
      null,
    );
    // Nothing new → nothing claimed.
    deepStrictEqual(
      claimNewlyCreatedSkill(new Set(["existing"]), [{ name: "existing" }], []),
      null,
    );
  });

  it("per-turn context pins the bound skill on every send, hidden from the bubble", () => {
    // The reported bug: inside "Audit my books"'s own chat, the model asked
    // "which skill should I rename?" — first-message context alone is not
    // reliable, so every outgoing prompt re-asserts the binding.
    const ctx = skillChatTurnContext({
      slug: "audit-my-books",
      displayName: "Audit my books",
    });
    for (const needle of [
      "not written by the user",
      'named "audit-my-books" in your skills list',
      "edit that file in place",
      '"Audit my books"',
      "Never ask which skill is meant",
      'frontmatter "title" field',
      'never rename the folder or the "name" field',
    ]) {
      ok(ctx.includes(needle), `context must mention: ${needle}`);
    }
    // No files: the model prompt is context + the user's words (the bubble is
    // the caller's displayText, not this).
    const prompt = buildAttachmentPrompt("rename it", [], [], ctx);
    ok(prompt.startsWith(ctx));
    ok(prompt.endsWith("rename it"));
    // With files: the attachment marker's `message` keeps ONLY the user's
    // words — the context never leaks into the rendered bubble.
    const withFile = buildAttachmentPrompt(
      "rename it",
      [{ name: "notes.txt" } as File],
      ["/tmp/notes.txt"],
      ctx,
    );
    const marker = withFile.split("\n")[0] ?? "";
    ok(marker.startsWith("<!--houston:attachments"));
    ok(!marker.includes("Houston context"));
    ok(withFile.includes(ctx));
  });

  it("title heal keeps a skill's chat named after the skill", () => {
    // The reported gap: renaming the skill in its chat left the persisted
    // conversation title on the old name (and a claimed create draft stayed
    // "New skill") — the chat follows the skill's display title.
    const chat = {
      id: "a1",
      agent: SKILL_SETUP_AGENT_MODE,
      skill_slug: "meeting-prep",
      title: "Meeting prep",
    };
    deepStrictEqual(
      findSkillChatTitleHeal(
        [chat],
        [{ name: "meeting-prep", title: "meeting skill" }],
        skillDisplayTitle,
      ),
      { activityId: "a1", title: "meeting skill" },
    );
    // Already consistent → nothing to do (the effect loop terminates).
    deepStrictEqual(
      findSkillChatTitleHeal(
        [{ ...chat, title: "meeting skill" }],
        [{ name: "meeting-prep", title: "meeting skill" }],
        skillDisplayTitle,
      ),
      null,
    );
    // No frontmatter title → the humanized slug is the display title.
    deepStrictEqual(
      findSkillChatTitleHeal(
        [{ ...chat, title: "New skill" }],
        [{ name: "meeting-prep" }],
        skillDisplayTitle,
      ),
      { activityId: "a1", title: "Meeting prep" },
    );
    // A chat two skills resolve to is never retitled (no flip-flopping).
    deepStrictEqual(
      findSkillChatTitleHeal(
        [{ id: "a2", agent: SKILL_SETUP_AGENT_MODE, title: "X" }],
        [
          { name: "s1", setup_activity_id: "a2" },
          { name: "s2", setup_activity_id: "a2" },
        ],
        skillDisplayTitle,
      ),
      null,
    );
  });
});
