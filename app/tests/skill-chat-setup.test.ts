import { deepStrictEqual, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";
import { buildAttachmentPrompt } from "../src/lib/attachment-message.ts";
import {
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import { skillDisplayTitle } from "../src/lib/humanize-skill-name.ts";
import { isSetupChatMode } from "../src/lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../src/lib/mission-selection.ts";
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
    ok(isSetupChatMode(SKILL_SETUP_AGENT_MODE));
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
          agent_path: "/w/a",
          type: "activity",
          status: "needs_you",
          agent: SKILL_SETUP_AGENT_MODE,
        },
        { agent_path: "/w/a", type: "activity", status: "needs_you" },
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

  it("create kickoff covers the guided interview HOU-791 asks for", () => {
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
      "carries that app's tag",
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
      'named "weekly-update" in your skills list',
      "edit that file where it is",
      "Never create a second skill",
      "DISPLAY NAME",
      'means changing "title"',
      "NEVER rename or move the folder",
      'never change "name"',
      '"description" is the one-line card text',
      "step-by-step procedure",
      '"setup_activity_id" field exactly as it is',
      "update that step's tag too",
      "approval",
    ]) {
      ok(prompt.includes(needle), `prompt must mention: ${needle}`);
    }
  });

  it("resolves a skill's chat by the durable reverse link first", () => {
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
    const unstamped = { id: "a3", agent: SKILL_SETUP_AGENT_MODE };
    deepStrictEqual(
      findSkillChatActivity([unstamped], {
        name: "research-company",
        setup_activity_id: "a3",
      }),
      unstamped,
    );
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
    const claimedForward = {
      id: "d2",
      agent: SKILL_SETUP_AGENT_MODE,
      status: "done",
    };
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
    deepStrictEqual(
      findSkillChatHeal(
        [{ id: "a1", agent: SKILL_SETUP_AGENT_MODE }],
        [{ name: "weekly-update", setup_activity_id: "a1" }],
      ),
      {
        kind: "stamp_activity",
        activityId: "a1",
        slug: "weekly-update",
        reason: "forward_link",
      },
    );
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
    deepStrictEqual(
      findSkillChatHeal(
        [{ id: "a1", agent: SKILL_SETUP_AGENT_MODE, skill_slug: "s-old" }],
        [{ name: "s-new", setup_activity_id: "a1" }],
      ),
      null,
    );
    deepStrictEqual(
      findSkillChatHeal(
        [{ id: "a1", agent: "researcher" }],
        [{ name: "s1", setup_activity_id: "a1" }],
      ),
      null,
    );
  });

  it("heal adopts a title-matched orphan chat back onto its chatless skill", () => {
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
      {
        kind: "stamp_activity",
        activityId: "a1",
        slug: "meeting-prep",
        reason: "orphan_adoption",
      },
    );
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
        reason: "orphan_adoption",
      },
    );
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
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "existing" }, { name: "meeting-prep" }],
        acts,
      ),
      "meeting-prep",
    );
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "meeting-prep", setup_activity_id: "d1" }],
        acts,
      ),
      null,
    );
    deepStrictEqual(
      claimNewlyCreatedSkill(
        prev,
        [{ name: "a-skill" }, { name: "b-skill" }],
        acts,
      ),
      null,
    );
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
    deepStrictEqual(
      claimNewlyCreatedSkill(new Set(["existing"]), [{ name: "existing" }], []),
      null,
    );
  });

  it("per-turn context pins the bound skill on every send, hidden from the bubble", () => {
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
    const prompt = buildAttachmentPrompt("rename it", [], [], ctx);
    ok(prompt.startsWith(ctx));
    ok(prompt.endsWith("rename it"));
    const withFile = buildAttachmentPrompt(
      "rename it",
      [{ name: "notes.txt" } as File],
      ["/tmp/notes.txt"],
      ctx,
    );
    const marker = withFile.split("\n")[0] ?? "";
    ok(marker.startsWith("<!--houston:attachments"));
    ok(!marker.includes("App context"));
    ok(withFile.includes(ctx));
  });

  it("title heal keeps a skill's chat named after the skill", () => {
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
    deepStrictEqual(
      findSkillChatTitleHeal(
        [{ ...chat, title: "meeting skill" }],
        [{ name: "meeting-prep", title: "meeting skill" }],
        skillDisplayTitle,
      ),
      null,
    );
    deepStrictEqual(
      findSkillChatTitleHeal(
        [{ ...chat, title: "New skill" }],
        [{ name: "meeting-prep" }],
        skillDisplayTitle,
      ),
      { activityId: "a1", title: "Meeting prep" },
    );
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

describe("the agent Skills section is the shared surface, scoped", () => {
  const read = (p: string) =>
    readFileSync(new URL(`../src/components/${p}`, import.meta.url), "utf8");
  const section = read("agent/agent-admin/agent-admin-skills.tsx");
  const body = read("skills-view/skills-view.tsx");
  const controls = read("skills-view/skills-controls.tsx");

  it("mounts the shared body with the agent as its scope", () => {
    ok(section.includes("<SkillsBody"), "renders the shared body");
    ok(section.includes("agent={agent}"), "scoped to this employee");
    ok(
      !section.includes("CatalogShell"),
      "the section builds no catalog of its own",
    );
  });

  it("carries no title of its own — the settings rail already names it", () => {
    ok(!section.includes("PageHero"), "no hero above the section's tools row");
    ok(!section.includes("listHeader"), "the body draws the section itself");
  });

  it("keeps no second list, tile strip or manage dialog", () => {
    for (const [name, src] of [
      ["agent-admin-skills", section],
      ["skills-view", body],
    ] as const) {
      ok(
        !src.includes("useInstalledSkillsStrip"),
        `${name} must not rebuild the tile strip`,
      );
      ok(
        !src.includes("ManageSkillDialog"),
        `${name} must not reopen the manage dialog`,
      );
    }
  });

  it("offers no remote skill import", () => {
    for (const [name, src] of [
      ["agent-admin-skills", section],
      ["skills-view", body],
      ["skills-controls", controls],
    ] as const) {
      ok(!src.includes("Community"), `${name} must not touch community skills`);
      ok(!src.includes("Marketplace"), `${name} must mount no marketplace`);
      ok(!src.includes("Repo"), `${name} must not import from a repo`);
      ok(!src.includes("Github"), `${name} must carry no GitHub affordance`);
    }
  });

  it("gives the scoped surface the second way in, and the library one button", () => {
    ok(controls.includes("onAddExisting === undefined"), "the library's fork");
    ok(controls.includes('t("global.createMenu.addExisting")'));
    ok(
      body.includes("useAddExistingSkill"),
      "the surface wires the add-existing flow",
    );
  });
});
