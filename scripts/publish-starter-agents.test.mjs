import { agentIrSchema } from "@houston/agentstore-contract";
import { describe, expect, it } from "vitest";
import {
  buildStarterAgentIr,
  indexExistingBySlug,
  listStarterAgentIds,
  STARTER_CATEGORY_MAP,
} from "./lib/starter-agent-ir.mjs";

// The pinned identity of every real starter agent, derived from its
// store/agents/<id>/houston.json. Locks the id → category remap and the
// slugify(name) → slug derivation the publish pipeline relies on.
const EXPECTED = {
  bookkeeping: { category: "finance", slug: "bookkeeper" },
  legal: { category: "other", slug: "general-counsel" },
  marketing: { category: "marketing", slug: "growth-lead" },
  operations: { category: "productivity", slug: "chief-of-staff" },
  outbound: { category: "sales", slug: "growth-hacker" },
  people: { category: "productivity", slug: "head-of-talent" },
  sales: { category: "sales", slug: "chief-revenue-officer" },
  support: { category: "customer-support", slug: "head-of-customer-success" },
};

const INTEGRATION_REGEX = /^[A-Z0-9_]{1,64}$/;

describe("starter-agent-ir mapping", () => {
  const ids = listStarterAgentIds();

  it("covers exactly the 8 known starter agents", () => {
    expect(ids).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(STARTER_CATEGORY_MAP).sort()).toEqual(ids);
  });

  for (const id of Object.keys(EXPECTED)) {
    describe(id, () => {
      const ir = buildStarterAgentIr(id);

      it("produces a schema-valid AgentIR", () => {
        expect(() => agentIrSchema.parse(ir)).not.toThrow();
        expect(ir.irVersion).toBe("2.0.0");
      });

      it("maps category, slug, creator, and provenance", () => {
        expect(ir.identity.category).toBe(EXPECTED[id].category);
        expect(ir.identity.slug).toBe(EXPECTED[id].slug);
        expect(ir.identity.creator).toEqual({ displayName: "Houston" });
        expect(ir.provenance).toEqual({
          createdVia: "houston",
          exporter: "publish-starter-agents",
          anonymized: false,
        });
        expect(ir.learnings).toEqual([]);
      });

      it("uppercases integrations and caps tags at 6", () => {
        expect(ir.integrations.length).toBeGreaterThan(0);
        expect(ir.integrations.every((s) => INTEGRATION_REGEX.test(s))).toBe(
          true,
        );
        expect(ir.identity.tags.length).toBeLessThanOrEqual(6);
      });

      it("carries every skill as a non-empty verbatim body", () => {
        expect(ir.skills.length).toBeGreaterThan(0);
        expect(ir.skills.every((s) => s.body.length > 0)).toBe(true);
        const slugs = ir.skills.map((s) => s.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
      });
    });
  }

  it("uppercases a known lowercase integration slug", () => {
    expect(buildStarterAgentIr("bookkeeping").integrations).toContain(
      "QUICKBOOKS",
    );
  });
});

// The idempotency guard must match an existing listing by slugify(name) — the
// same value ir.identity.slug carries — NOT by the gateway's finalized share
// slug, which is a global unique key (may be suffixed) and is null before
// publish. Keying by the finalized slug would miss both cases and re-POST a
// duplicate on the next run.
describe("indexExistingBySlug idempotency match", () => {
  const ir = buildStarterAgentIr("bookkeeping");

  it("matches a listing whose finalized slug was suffixed for uniqueness", () => {
    const index = indexExistingBySlug([
      { id: "agent-1", slug: `${ir.identity.slug}-2`, name: ir.identity.name },
    ]);
    expect(index.get(ir.identity.slug)?.id).toBe("agent-1");
  });

  it("matches an unpublished listing that has no slug yet", () => {
    const index = indexExistingBySlug([
      { id: "agent-2", slug: null, name: ir.identity.name },
    ]);
    expect(index.get(ir.identity.slug)?.id).toBe("agent-2");
  });

  it("skips a listing with no usable name and keeps later duplicates", () => {
    const index = indexExistingBySlug([
      { id: "no-name", slug: "x", name: "!!!" },
      { id: "first", slug: null, name: ir.identity.name },
      { id: "second", slug: `${ir.identity.slug}-3`, name: ir.identity.name },
    ]);
    expect(index.has("")).toBe(false);
    expect(index.get(ir.identity.slug)?.id).toBe("second");
  });
});
