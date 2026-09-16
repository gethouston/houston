import { describe, expect, it } from "vitest";
import { exampleAgentIr } from "./__fixtures__/example-ir";
import { agentIrSchema } from "./ir";
import { migrateAgentIr } from "./ir-migrate";

/** A composio wake with the fixture's values, overridable field by field. */
function composioWake(over: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "composio",
    toolkit: "gmail",
    triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
    triggerConfig: { labelIds: "INBOX" },
    ...over,
  };
}

/** A minimal schedule routine, overridable field by field (undefined deletes). */
function routine(over: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: "daily",
    name: "Daily",
    prompt: "Check the inbox.",
    wake: { kind: "schedule", cron: "0 8 * * *" },
    ...over,
  };
  for (const [k, v] of Object.entries(base))
    if (v === undefined) delete base[k];
  return base;
}

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
    ["empty routine id", (d) => (d.routines = [routine({ id: "" })])],
    [
      "routine id too long",
      (d) => (d.routines = [routine({ id: "x".repeat(65) })]),
    ],
    ["empty routine name", (d) => (d.routines = [routine({ name: "" })])],
    [
      "routine name too long",
      (d) => (d.routines = [routine({ name: "x".repeat(121) })]),
    ],
    ["empty routine prompt", (d) => (d.routines = [routine({ prompt: "" })])],
    [
      "routine prompt too long",
      (d) => (d.routines = [routine({ prompt: "x".repeat(20001) })]),
    ],
    [
      "duplicate routine id",
      (d) => (d.routines = [routine({}), routine({ prompt: "other" })]),
    ],
    [
      "too many routines",
      (d) =>
        (d.routines = Array.from({ length: 33 }, (_, i) =>
          routine({ id: `r${i}` }),
        )),
    ],
    [
      "routine with no wake",
      (d) => (d.routines = [routine({ wake: undefined })]),
    ],
    [
      "unknown wake kind",
      (d) => (d.routines = [routine({ wake: { kind: "carrier-pigeon" } })]),
    ],
    [
      "schedule wake with no cron",
      (d) => (d.routines = [routine({ wake: { kind: "schedule" } })]),
    ],
    [
      "cron too long",
      (d) =>
        (d.routines = [
          routine({ wake: { kind: "schedule", cron: "0".repeat(121) } }),
        ]),
    ],
    [
      "composio wake missing triggerConfig",
      (d) =>
        (d.routines = [
          routine({
            wake: {
              kind: "composio",
              toolkit: "gmail",
              triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
            },
          }),
        ]),
    ],
    [
      "uppercase toolkit",
      (d) =>
        (d.routines = [routine({ wake: composioWake({ toolkit: "GMAIL" }) })]),
    ],
    [
      "toolkit with a dash",
      (d) =>
        (d.routines = [
          routine({ wake: composioWake({ toolkit: "google-calendar" }) }),
        ]),
    ],
    [
      "lowercase triggerSlug",
      (d) =>
        (d.routines = [
          routine({ wake: composioWake({ triggerSlug: "gmail_new_message" }) }),
        ]),
    ],
    [
      "triggerConfig over the serialized cap",
      (d) =>
        (d.routines = [
          routine({
            wake: composioWake({ triggerConfig: { q: "x".repeat(8001) } }),
          }),
        ]),
    ],
    ["bad chatMode", (d) => (d.routines = [routine({ chatMode: "whenever" })])],
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

describe("agentIrSchema routines", () => {
  it("accepts one routine of each wake kind (the fixture)", () => {
    const parsed = agentIrSchema.parse(exampleAgentIr);
    expect(parsed.routines.map((r) => r.wake.kind)).toEqual([
      "schedule",
      "composio",
      "webhook",
    ]);
  });

  it("defaults routines to [] when omitted", () => {
    const d = draft();
    d.routines = undefined;
    expect(agentIrSchema.parse(d).routines).toEqual([]);
  });

  it("keeps chatMode and suppressWhenSilent optional", () => {
    const d = draft();
    d.routines = [
      routine({ chatMode: undefined, suppressWhenSilent: undefined }),
    ];
    const parsed = agentIrSchema.parse(d);
    expect(parsed.routines[0]?.chatMode).toBeUndefined();
    expect(parsed.routines[0]?.suppressWhenSilent).toBeUndefined();
  });

  it("accepts 32 routines and rejects 33", () => {
    const d = draft();
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => routine({ id: `r${i}` }));
    d.routines = many(32);
    expect(agentIrSchema.safeParse(d).success).toBe(true);
    d.routines = many(33);
    expect(agentIrSchema.safeParse(d).success).toBe(false);
  });

  it("strips machine-local keys instead of rejecting them", () => {
    // z.object strips unknown keys, so a publisher that sends Houston's
    // account-local fields still publishes — they just never get stored.
    const d = draft();
    d.routines = [routine({ enabled: false, provider: "anthropic" })];
    const parsed = agentIrSchema.parse(d);
    expect(parsed.routines[0]).not.toHaveProperty("enabled");
    expect(parsed.routines[0]).not.toHaveProperty("provider");
  });

  it("strips a minted webhook key prefix from a webhook wake", () => {
    // key_prefix names an address minted for SOMEONE ELSE's routine; it has no
    // meaning in a listing, and z.object drops it rather than 422ing a publish.
    const d = draft();
    d.routines = [
      routine({ wake: { kind: "webhook", key_prefix: "wh_abcd1234" } }),
    ];
    expect(agentIrSchema.parse(d).routines[0]?.wake).toEqual({
      kind: "webhook",
    });
  });

  it("names the duplicate routine id in the issue path", () => {
    const d = draft();
    d.routines = [routine({}), routine({ name: "Twin" })];
    const result = agentIrSchema.safeParse(d);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((i) => i.path.join(".") === "routines.1.id"),
    ).toBe(true);
  });
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
