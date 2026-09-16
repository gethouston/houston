import { describe, expect, it } from "vitest";
import { agentIrSchema } from "./ir";
import { normalizeAgentIr } from "./normalize";

const WAKE = { kind: "schedule", cron: "0 8 * * *" };

describe("normalizeAgentIr", () => {
  it("backfills a bare submission into a schema-valid IR", () => {
    const { ir, notes } = normalizeAgentIr({
      identity: { name: "My Helper Bot" },
    });
    const parsed = agentIrSchema.parse(ir);
    expect(parsed.irVersion).toBe("2.0.0");
    expect(parsed.identity.slug).toBe("my-helper-bot");
    expect(parsed.identity.description).toBe("My Helper Bot");
    expect(parsed.identity.category).toBe("other");
    expect(parsed.identity.creator.displayName).toBe("Unclaimed");
    expect(parsed.instructions).toBe("");
    expect(parsed.provenance.createdVia).toBe("agent-post");
    expect(notes.length).toBeGreaterThan(0);
  });

  it("defaults the description from the tagline when present", () => {
    const { ir } = normalizeAgentIr({
      identity: { name: "Bot", tagline: "  Does the thing.  " },
    });
    const parsed = agentIrSchema.parse(ir);
    expect(parsed.identity.description).toBe("Does the thing.");
  });

  it("pins irVersion even when a wrong one is sent", () => {
    const { ir } = normalizeAgentIr({
      irVersion: "9.9.9",
      identity: { name: "X" },
    });
    expect((ir as { irVersion: string }).irVersion).toBe("2.0.0");
  });

  it("slugifies a human-readable category", () => {
    const { ir } = normalizeAgentIr({
      identity: { name: "X", category: "Data Science" },
    });
    expect((ir as { identity: { category: string } }).identity.category).toBe(
      "data-science",
    );
  });

  it("clamps tags to 6 lowercase slugs, deduped", () => {
    const { ir } = normalizeAgentIr({
      identity: {
        name: "X",
        tags: ["Email", "email", "Inbox!!", "a", "b", "c", "d", "e"],
      },
    });
    const tags = (ir as { identity: { tags: string[] } }).identity.tags;
    expect(tags).toHaveLength(6);
    expect(tags).toContain("email");
    expect(tags).toContain("inbox");
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("keeps a valid creator (with url) untouched", () => {
    const { ir } = normalizeAgentIr({
      identity: {
        name: "X",
        creator: { displayName: "Real Person", url: "https://x.test" },
      },
    });
    expect((ir as { identity: { creator: unknown } }).identity.creator).toEqual(
      {
        displayName: "Real Person",
        url: "https://x.test",
      },
    );
  });

  it("uppercases, dedupes, and drops malformed integrations", () => {
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      integrations: ["gmail", "Gmail", "google-calendar", "SLACK", 42],
    });
    expect((ir as { integrations: string[] }).integrations).toEqual([
      "GMAIL",
      "SLACK",
    ]);
  });

  it("derives skill slugs from frontmatter and dedupes by suffix", () => {
    const body = "---\ntitle: Weekly Report\n---\nDo the report.";
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      skills: [{ body }, { body }],
    });
    const skills = (ir as { skills: Array<{ slug: string }> }).skills;
    expect(skills[0].slug).toBe("weekly-report");
    expect(skills[1].slug).toBe("weekly-report-2");
  });

  it("keeps a valid explicit skill slug", () => {
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      skills: [{ slug: "custom-slug", body: "text" }],
    });
    expect((ir as { skills: Array<{ slug: string }> }).skills[0].slug).toBe(
      "custom-slug",
    );
  });

  it("backfills and dedupes learning ids", () => {
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      learnings: [
        { text: "a" },
        { text: "b" },
        { id: "shared", text: "c" },
        { id: "shared", text: "d" },
      ],
    });
    const learnings = (ir as { learnings: Array<{ id: string }> }).learnings;
    const ids = learnings.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("learning-1");
  });

  it("derives a valid slug for a name with no Latin characters", () => {
    // slugify() strips every non-[a-z0-9] char, so a fully non-Latin/emoji name
    // yields "" and must fall back to a constant (else agentIrSchema 422s).
    for (const name of ["日本語エージェント", "北京助手", "🚀🎉"]) {
      const { ir } = normalizeAgentIr({ identity: { name } });
      const parsed = agentIrSchema.parse(ir);
      expect(parsed.identity.slug).toBe("agent");
    }
  });

  it("terminates and dedupes two skills sharing a 64-char slug (no infinite loop)", () => {
    const slug = "a".repeat(64);
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      skills: [
        { slug, body: "x" },
        { slug, body: "y" },
      ],
    });
    const parsed = agentIrSchema.parse(ir);
    const slugs = parsed.skills.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(2);
    for (const s of slugs) expect(s.length).toBeLessThanOrEqual(64);
  });

  it("terminates and dedupes two learnings sharing a 64-char id (no infinite loop)", () => {
    const id = "a".repeat(64);
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      learnings: [
        { id, text: "x" },
        { id, text: "y" },
      ],
    });
    const parsed = agentIrSchema.parse(ir);
    const ids = parsed.learnings.map((l) => l.id);
    expect(new Set(ids).size).toBe(2);
    for (const i of ids) expect(i.length).toBeLessThanOrEqual(64);
  });

  it("leaves routines absent when the field was omitted (the schema defaults it)", () => {
    const { ir } = normalizeAgentIr({ identity: { name: "X" } });
    expect((ir as { routines?: unknown }).routines).toBeUndefined();
    expect(agentIrSchema.parse(ir).routines).toEqual([]);
  });

  it("defaults a non-list routines to none, with a note", () => {
    const { ir, notes } = normalizeAgentIr({
      identity: { name: "X" },
      routines: "every morning",
    });
    expect((ir as { routines: unknown[] }).routines).toEqual([]);
    expect(notes).toContain("routines was not a list, defaulted to none");
  });

  it("drops a non-object routine entry with a note", () => {
    const { ir, notes } = normalizeAgentIr({
      identity: { name: "X" },
      routines: ["nope", { name: "Real", prompt: "p", wake: WAKE }],
    });
    const routines = (ir as { routines: Array<{ name: string }> }).routines;
    expect(routines).toHaveLength(1);
    expect(routines[0]?.name).toBe("Real");
    expect(notes).toContain("routines[0] dropped (not an object)");
  });

  it("derives and dedupes routine ids", () => {
    const { ir, notes } = normalizeAgentIr({
      identity: { name: "X" },
      routines: [
        { name: "A", prompt: "p", wake: WAKE },
        { name: "B", prompt: "p", wake: WAKE },
        { id: "shared", name: "C", prompt: "p", wake: WAKE },
        { id: "shared", name: "D", prompt: "p", wake: WAKE },
      ],
    });
    const ids = (ir as { routines: Array<{ id: string }> }).routines.map(
      (r) => r.id,
    );
    expect(ids).toEqual(["routine-1", "routine-2", "shared", "shared-2"]);
    expect(notes).toContain("routines[0].id derived");
  });

  it("terminates and dedupes two routines sharing a 64-char id", () => {
    const id = "a".repeat(64);
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      routines: [
        { id, name: "A", prompt: "p", wake: WAKE },
        { id, name: "B", prompt: "p", wake: WAKE },
      ],
    });
    const ids = agentIrSchema.parse(ir).routines.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    for (const i of ids) expect(i.length).toBeLessThanOrEqual(64);
  });

  it("lowercases the toolkit and uppercases the trigger slug", () => {
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      routines: [
        {
          id: "r1",
          name: "Mail",
          prompt: "p",
          wake: {
            kind: "composio",
            toolkit: "  GMail ",
            triggerSlug: " gmail_new_gmail_message ",
            triggerConfig: { userId: "me" },
          },
        },
      ],
    });
    expect(agentIrSchema.parse(ir).routines[0]?.wake).toEqual({
      kind: "composio",
      toolkit: "gmail",
      triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
      triggerConfig: { userId: "me" },
    });
  });

  it("leaves a malformed wake for validation to reject, never dropping it", () => {
    // Beta policy: a publisher must learn their routine did not make it.
    const { ir } = normalizeAgentIr({
      identity: { name: "X" },
      routines: [
        { id: "r1", name: "A", prompt: "p", wake: { kind: "pigeon" } },
      ],
    });
    expect((ir as { routines: unknown[] }).routines).toHaveLength(1);
    expect(agentIrSchema.safeParse(ir).success).toBe(false);
  });

  it("returns non-object input unchanged with no notes", () => {
    expect(normalizeAgentIr(null)).toEqual({ ir: null, notes: [] });
    expect(normalizeAgentIr("nope")).toEqual({ ir: "nope", notes: [] });
  });

  it("does not mutate the caller's object", () => {
    const input = { identity: { name: "X" } };
    normalizeAgentIr(input);
    expect(input).toEqual({ identity: { name: "X" } });
  });
});
