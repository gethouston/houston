import { describe, expect, it } from "vitest";
import type * as schema from "@/db/schema";
import { toAgentSummary } from "./summary";

function makeAgent(overrides: Partial<schema.Agent> = {}): schema.Agent {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    slug: null,
    name: "Helper",
    tagline: null,
    description: "A helper.",
    iconKind: null,
    iconValue: null,
    color: null,
    category: "productivity",
    tags: [],
    integrations: [],
    creatorDisplayName: "Dana",
    creatorUrl: null,
    manageTokenHash: "deadbeef",
    supabaseUserId: null,
    state: "draft",
    visibility: "unlisted",
    publicRequestedAt: null,
    publishedVersionId: null,
    viewsCount: 0,
    installsCount: 0,
    searchTsv: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  return { ...base, ...overrides } as unknown as schema.Agent;
}

describe("toAgentSummary", () => {
  it("omits the manage-token hash and exposes public fields", () => {
    const summary = toAgentSummary(makeAgent());
    expect(summary).not.toHaveProperty("manageTokenHash");
    expect(summary.creator).toEqual({ displayName: "Dana", url: null });
    expect(summary.shareUrl).toBeNull();
  });

  it("derives shareUrl for a published agent with a slug", () => {
    const summary = toAgentSummary(
      makeAgent({ state: "published", slug: "helper" }),
    );
    expect(summary.shareUrl).toMatch(/\/a\/helper$/);
  });

  it("does not derive shareUrl for a draft even with a slug", () => {
    const summary = toAgentSummary(
      makeAgent({ state: "draft", slug: "helper" }),
    );
    expect(summary.shareUrl).toBeNull();
  });

  it("reconstructs an emoji icon from its columns", () => {
    const summary = toAgentSummary(
      makeAgent({ iconKind: "emoji", iconValue: "🤖" }),
    );
    expect(summary.icon).toEqual({ kind: "emoji", value: "🤖" });
  });
});
