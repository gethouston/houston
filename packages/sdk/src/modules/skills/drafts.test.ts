import { describe, expect, it } from "vitest";
import {
  createSkillDraftWrites,
  discardDraftThenRestart,
  findDraftSkillChatActivities,
  isSkillSetupMode,
  resolveCreateChatStart,
  resolveDraftResume,
  SKILL_SETUP_AGENT_MODE,
  skillDraftLastWorkedAt,
  unfinishedDraftRows,
} from "../../index";

/**
 * Building a skill in chat starts a conversation every mission board filters
 * out, so until the agent writes the SKILL.md nothing but the Skills surface
 * lists it. The rules for picking one back up, listing them and throwing one
 * away are the SDK's, so iOS and the AI Manager answer them the same way.
 */

const setup = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  agent: SKILL_SETUP_AGENT_MODE,
  ...over,
});

describe("isSkillSetupMode", () => {
  it("recognizes the namespaced sentinel alone", () => {
    expect(isSkillSetupMode(SKILL_SETUP_AGENT_MODE)).toBe(true);
    expect(isSkillSetupMode("skill-setup")).toBe(false);
    expect(isSkillSetupMode(null)).toBe(false);
    expect(isSkillSetupMode(undefined)).toBe(false);
  });
});

describe("findDraftSkillChatActivities", () => {
  it("keeps every live setup chat no skill has claimed", () => {
    expect(
      findDraftSkillChatActivities(
        [setup({ id: "a1" }), setup({ id: "a2" })],
        [],
      ).map((a) => a.id),
    ).toEqual(["a1", "a2"]);
  });

  it("drops a chat a skill claimed, in either direction", () => {
    const rows = [
      setup({ id: "stamped", skill_slug: "invoices" }),
      setup({ id: "linked" }),
      setup({ id: "free" }),
    ];
    expect(
      findDraftSkillChatActivities(rows, [
        { name: "invoices" },
        { name: "notes", setup_activity_id: "linked" },
      ]).map((a) => a.id),
    ).toEqual(["free"]);
  });

  it("drops archived chats and anything that is not a setup chat", () => {
    expect(
      findDraftSkillChatActivities(
        [
          setup({ id: "gone", status: "archived" }),
          setup({ id: "mission", agent: null }),
        ],
        undefined,
      ),
    ).toEqual([]);
  });

  it("reads a missing list as nothing to classify", () => {
    expect(findDraftSkillChatActivities(undefined, undefined)).toEqual([]);
  });
});

describe("resolveCreateChatStart", () => {
  const listing = { allowResume: true, failed: false };

  it("waits while the agent's chats are still being read", () => {
    expect(
      resolveCreateChatStart({ ...listing, settled: false, drafts: [] }),
    ).toEqual({ kind: "wait" });
  });

  it("waits while the data is a cached placeholder", () => {
    // A placeholder row carries no `skill_slug` stamp, so a finished skill's
    // chat reads as unfinished; resuming it lands the user in a conversation
    // that disappears the moment the real read answers.
    expect(
      resolveCreateChatStart({
        ...listing,
        settled: false,
        drafts: [{ id: "placeholder" }],
      }),
    ).toEqual({ kind: "wait" });
  });

  it("starts a fresh chat when the read failed", () => {
    expect(
      resolveCreateChatStart({
        allowResume: true,
        settled: false,
        failed: true,
        drafts: [{ id: "a1" }],
      }),
    ).toEqual({ kind: "new" });
  });

  it("starts a fresh chat where the unfinished ones are not listed", () => {
    expect(
      resolveCreateChatStart({
        allowResume: false,
        settled: true,
        failed: false,
        drafts: [{ id: "a1" }],
      }),
    ).toEqual({ kind: "new" });
  });

  it("starts a fresh chat when nothing is unfinished", () => {
    expect(
      resolveCreateChatStart({ ...listing, settled: true, drafts: [] }),
    ).toEqual({ kind: "new" });
  });

  it("resumes the one worked on most recently", () => {
    expect(
      resolveCreateChatStart({
        ...listing,
        settled: true,
        drafts: [
          { id: "older", updated_at: "2026-01-01T00:00:00.000Z" },
          { id: "newer", updated_at: "2026-03-01T00:00:00.000Z" },
        ],
      }),
    ).toEqual({ kind: "resume", activityId: "newer" });
  });

  it("keeps the list's own order when no chat carries a stamp", () => {
    expect(
      resolveCreateChatStart({
        ...listing,
        settled: true,
        drafts: [{ id: "first" }, { id: "second" }],
      }),
    ).toEqual({ kind: "resume", activityId: "first" });
  });
});

describe("resolveDraftResume", () => {
  it("waits for the settled read before opening a named chat", () => {
    expect(
      resolveDraftResume({
        settled: false,
        failed: false,
        activityId: "a1",
        drafts: [{ id: "a1" }],
      }),
    ).toEqual({ kind: "wait" });
  });

  it("opens the chat once the settled read still calls it unfinished", () => {
    expect(
      resolveDraftResume({
        settled: true,
        failed: false,
        activityId: "a1",
        drafts: [{ id: "a1" }],
      }),
    ).toEqual({ kind: "resume", activityId: "a1" });
  });

  it("reports a chat the settled read no longer lists", () => {
    // The row was drawn off a cached placeholder, or the skill claimed the
    // chat between the tap and the read: there is nothing left to resume.
    expect(
      resolveDraftResume({
        settled: true,
        failed: false,
        activityId: "a1",
        drafts: [{ id: "a2" }],
      }),
    ).toEqual({ kind: "missing" });
  });

  it("stops waiting when the read failed", () => {
    expect(
      resolveDraftResume({
        settled: false,
        failed: true,
        activityId: "a1",
        drafts: [],
      }),
    ).toEqual({ kind: "missing" });
  });
});

describe("unfinishedDraftRows", () => {
  it("draws nothing until the read is settled", () => {
    // Cross-agent placeholder rows carry no `skill_slug`, so every shipped
    // skill's chat would paint as an unfinished draft on a cold open.
    expect(
      unfinishedDraftRows({
        settled: false,
        drafts: [{ id: "a" }, { id: "b" }],
        openActivityId: null,
      }),
    ).toEqual([]);
  });

  it("lists every unfinished chat once the read is settled", () => {
    expect(
      unfinishedDraftRows({
        settled: true,
        drafts: [{ id: "a" }, { id: "b" }],
        openActivityId: null,
      }),
    ).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("leaves out the chat already open in the panel", () => {
    expect(
      unfinishedDraftRows({
        settled: true,
        drafts: [{ id: "a" }, { id: "b" }],
        openActivityId: "a",
      }),
    ).toEqual([{ id: "b" }]);
  });
});

describe("skillDraftLastWorkedAt", () => {
  it("reads the chat's own stamp as milliseconds", () => {
    expect(
      skillDraftLastWorkedAt({ updated_at: "2026-03-01T00:00:00.000Z" }),
    ).toBe(Date.parse("2026-03-01T00:00:00.000Z"));
  });

  it("answers null when there is no usable stamp", () => {
    expect(skillDraftLastWorkedAt({})).toBeNull();
    expect(skillDraftLastWorkedAt({ updated_at: "whenever" })).toBeNull();
  });
});

describe("discardDraftThenRestart", () => {
  it("starts the replacement once the old chat is gone", async () => {
    const order: string[] = [];
    await discardDraftThenRestart({
      archive: async () => {
        order.push("archive");
        return true;
      },
      startNew: () => order.push("start"),
    });
    expect(order).toEqual(["archive", "start"]);
  });

  it("keeps the current chat when the archive fails", async () => {
    // A replacement beside a chat that is still there leaves TWO unfinished
    // chats, and the user threw one away.
    let started = false;
    await discardDraftThenRestart({
      archive: async () => false,
      startNew: () => {
        started = true;
      },
    });
    expect(started).toBe(false);
  });
});

describe("discardSkillDraft", () => {
  it("retires the chat by archiving its activity", async () => {
    const calls: [string, string, string][] = [];
    const writes = createSkillDraftWrites({
      setStatus: async (agentId, activityId, status) => {
        calls.push([agentId, activityId, status]);
      },
    });
    await writes.discardSkillDraft("agent-1", "a1");
    expect(calls).toEqual([["agent-1", "a1", "archived"]]);
  });
});
