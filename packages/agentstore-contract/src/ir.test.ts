import { describe, expect, it } from "vitest";
import { exampleAgentIr } from "./__fixtures__/example-ir";
import { agentIrSchema, migrateAgentIr } from "./ir";

/** Deep clone of the fixture as a plain record, for targeted mutation. */
function draft(): Record<string, unknown> {
  return structuredClone(exampleAgentIr) as unknown as Record<string, unknown>;
}

describe("agentIrSchema", () => {
  it("accepts the rich fixture", () => {
    expect(() => agentIrSchema.parse(exampleAgentIr)).not.toThrow();
  });

  it("defaults the optional arrays when omitted", () => {
    const parsed = agentIrSchema.parse({
      irVersion: "2.0.0",
      identity: {
        slug: "minimal",
        name: "Minimal",
        description: "d",
        category: "other",
        creator: { displayName: "Someone" },
      },
      instructions: "",
      provenance: { createdVia: "agent-post" },
    });
    expect(parsed.skills).toEqual([]);
    expect(parsed.learnings).toEqual([]);
    expect(parsed.integrations).toEqual([]);
    expect(parsed.identity.tags).toEqual([]);
  });

  it("allows empty instructions", () => {
    const d = draft();
    d.instructions = "";
    expect(() => agentIrSchema.parse(d)).not.toThrow();
  });

  const rejections: Array<[string, (d: Record<string, unknown>) => void]> = [
    ["wrong irVersion", (d) => (d.irVersion = "1.0.0")],
    [
      "bad identity slug",
      (d) => ((d.identity as Record<string, unknown>).slug = "-nope"),
    ],
    [
      "slug starting non-alnum",
      (d) => ((d.identity as Record<string, unknown>).slug = "-x"),
    ],
    ["empty name", (d) => ((d.identity as Record<string, unknown>).name = "")],
    [
      "name too long",
      (d) => ((d.identity as Record<string, unknown>).name = "x".repeat(121)),
    ],
    [
      "empty description",
      (d) => ((d.identity as Record<string, unknown>).description = ""),
    ],
    [
      "description too long",
      (d) =>
        ((d.identity as Record<string, unknown>).description = "x".repeat(
          20001,
        )),
    ],
    [
      "tagline too long",
      (d) =>
        ((d.identity as Record<string, unknown>).tagline = "x".repeat(161)),
    ],
    [
      "non-slug category",
      (d) => ((d.identity as Record<string, unknown>).category = "Not A Slug"),
    ],
    [
      "too many tags",
      (d) =>
        ((d.identity as Record<string, unknown>).tags = [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
        ]),
    ],
    [
      "non-slug tag",
      (d) => ((d.identity as Record<string, unknown>).tags = ["Bad Tag"]),
    ],
    [
      "color too long",
      (d) => ((d.identity as Record<string, unknown>).color = "x".repeat(33)),
    ],
    [
      "non-https icon url",
      (d) =>
        ((d.identity as Record<string, unknown>).icon = {
          kind: "url",
          url: "http://x.test/i.png",
        }),
    ],
    [
      "emoji value too long",
      (d) =>
        ((d.identity as Record<string, unknown>).icon = {
          kind: "emoji",
          value: "x".repeat(81),
        }),
    ],
    [
      "creator without displayName",
      (d) => ((d.identity as Record<string, unknown>).creator = {}),
    ],
    [
      "non-https creator url",
      (d) =>
        ((d.identity as Record<string, unknown>).creator = {
          displayName: "A",
          url: "ftp://x.test",
        }),
    ],
    ["instructions too long", (d) => (d.instructions = "x".repeat(200001))],
    ["empty skill body", (d) => (d.skills = [{ slug: "s", body: "" }])],
    ["bad skill slug", (d) => (d.skills = [{ slug: "Bad", body: "text" }])],
    [
      "duplicate skill slug",
      (d) =>
        (d.skills = [
          { slug: "dup", body: "a" },
          { slug: "dup", body: "b" },
        ]),
    ],
    [
      "skill body too long",
      (d) => (d.skills = [{ slug: "s", body: "x".repeat(200001) }]),
    ],
    ["empty learning id", (d) => (d.learnings = [{ id: "", text: "t" }])],
    ["empty learning text", (d) => (d.learnings = [{ id: "l1", text: "" }])],
    [
      "learning text too long",
      (d) => (d.learnings = [{ id: "l1", text: "x".repeat(4001) }]),
    ],
    [
      "duplicate learning id",
      (d) =>
        (d.learnings = [
          { id: "d", text: "a" },
          { id: "d", text: "b" },
        ]),
    ],
    [
      "bad createdAt",
      (d) => (d.learnings = [{ id: "l1", text: "t", createdAt: "not-a-date" }]),
    ],
    ["lowercase integration", (d) => (d.integrations = ["gmail"])],
    ["integration with dash", (d) => (d.integrations = ["GOOGLE-CALENDAR"])],
    [
      "bad provenance createdVia",
      (d) =>
        ((d.provenance as Record<string, unknown>).createdVia = "elsewhere"),
    ],
  ];

  for (const [label, mutate] of rejections) {
    it(`rejects: ${label}`, () => {
      const d = draft();
      mutate(d);
      expect(agentIrSchema.safeParse(d).success).toBe(false);
    });
  }
});

describe("migrateAgentIr", () => {
  it("is a validating passthrough for the current version", () => {
    const migrated = migrateAgentIr(exampleAgentIr);
    expect(migrated.irVersion).toBe("2.0.0");
    expect(migrated.identity.slug).toBe("inbox-triage-helper");
  });

  it("throws on a non-object", () => {
    expect(() => migrateAgentIr(null)).toThrow();
    expect(() => migrateAgentIr("nope")).toThrow();
  });

  it("throws when the payload is invalid after migration", () => {
    expect(() => migrateAgentIr({ irVersion: "2.0.0" })).toThrow();
  });
});
