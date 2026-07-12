import type { AgentProvenance } from "@houston/agentstore-contract";
import type { Learning, Routine } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import type { PortableContent } from "./portable";
import { irFromPortable, portableFromIr } from "./store-ir";

const provenance: AgentProvenance = {
  createdVia: "houston",
  exporter: "houston-app",
  houstonVersion: "1.2.3",
  anonymized: false,
};

const baseOpts = {
  identity: {
    name: "Sales Copilot",
    description: "Handles inbound sales.",
    category: "productivity",
  },
  creator: { displayName: "Dana" },
  integrations: [] as string[],
  provenance,
};

const routine: Routine = {
  id: "r1",
  name: "Daily",
  prompt: "check inbox",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("irFromPortable", () => {
  test("maps content + identity into a valid IR", () => {
    const content: PortableContent = {
      claudeMd: "# Role\nYou sell things.",
      skills: [{ slug: "research", body: "---\ntitle: Research\n---\nbody" }],
      routines: [routine],
      learnings: [],
    };
    const ir = irFromPortable(content, {
      ...baseOpts,
      identity: { ...baseOpts.identity, tagline: "Your sales sidekick" },
    });
    expect(ir.irVersion).toBe("2.0.0");
    expect(ir.identity.slug).toBe("sales-copilot");
    expect(ir.identity.name).toBe("Sales Copilot");
    expect(ir.identity.tagline).toBe("Your sales sidekick");
    expect(ir.identity.category).toBe("productivity");
    expect(ir.identity.creator.displayName).toBe("Dana");
    expect(ir.instructions).toBe("# Role\nYou sell things.");
    expect(ir.skills).toEqual([
      { slug: "research", body: "---\ntitle: Research\n---\nbody" },
    ]);
    expect(ir.provenance).toEqual(provenance);
  });

  test("omits tagline when not provided", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      baseOpts,
    );
    expect(ir.identity.tagline).toBeUndefined();
  });

  test("empty CLAUDE.md becomes empty instructions", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      baseOpts,
    );
    expect(ir.instructions).toBe("");
  });

  test("integrations are uppercased + deduped via the contract rules", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      {
        ...baseOpts,
        integrations: ["gmail", "GMAIL", "google_maps", "not a slug!"],
      },
    );
    expect(ir.integrations).toEqual(["GMAIL", "GOOGLE_MAPS"]);
  });

  test("learnings carry id/text and their createdAt", () => {
    const learnings: Learning[] = [
      {
        id: "L1",
        text: "prefers email",
        created_at: "2026-02-02T10:00:00.000Z",
      },
    ];
    const ir = irFromPortable(
      { skills: [], routines: [], learnings },
      baseOpts,
    );
    expect(ir.learnings).toEqual([
      {
        id: "L1",
        text: "prefers email",
        createdAt: "2026-02-02T10:00:00.000Z",
      },
    ]);
  });

  test("throws (never silently drops) on an unrepresentable IR", () => {
    // A description over the 20000-char cap cannot be normalized away.
    expect(() =>
      irFromPortable(
        { skills: [], routines: [], learnings: [] },
        {
          ...baseOpts,
          identity: { ...baseOpts.identity, description: "x".repeat(20001) },
        },
      ),
    ).toThrow();
  });
});

describe("portableFromIr", () => {
  test("empty instructions maps back to an absent CLAUDE.md", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      baseOpts,
    );
    const { content, meta } = portableFromIr(ir);
    expect(content.claudeMd).toBeUndefined();
    expect(content.routines).toEqual([]);
    expect(meta).toEqual({
      agentName: "Sales Copilot",
      description: "Handles inbound sales.",
    });
  });
});

describe("round-trip", () => {
  test("portableFromIr(irFromPortable(x)).content equals x modulo routines", () => {
    const x: PortableContent = {
      claudeMd: "# Role\nAll the instructions.",
      skills: [
        { slug: "alpha", body: "---\ntitle: Alpha\n---\nalpha body" },
        { slug: "beta", body: "---\ntitle: Beta\n---\nbeta body" },
      ],
      routines: [routine],
      learnings: [
        { id: "L1", text: "one", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "L2", text: "two", created_at: "2026-01-02T00:00:00.000Z" },
      ],
    };
    const { content } = portableFromIr(irFromPortable(x, baseOpts));
    expect(content).toEqual({ ...x, routines: [] });
  });

  test("round-trips content with no CLAUDE.md and no learnings", () => {
    const x: PortableContent = {
      skills: [{ slug: "solo", body: "---\ntitle: Solo\n---\nsolo body" }],
      routines: [],
      learnings: [],
    };
    const { content } = portableFromIr(irFromPortable(x, baseOpts));
    expect(content).toEqual({ ...x, routines: [] });
  });
});
