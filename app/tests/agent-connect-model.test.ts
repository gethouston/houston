import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgsList } from "@houston-ai/engine-client";
import {
  connectEndpoints,
  connectOrgSlug,
} from "../src/lib/agent-connect-model.ts";

const BASE = "https://gateway.gethouston.ai";

const orgsList = (over: Partial<OrgsList> = {}): OrgsList => ({
  orgs: [
    {
      id: "org-1",
      slug: "abcdef0123456789",
      name: "Acme",
      kind: "team",
      role: "owner",
      memberCount: 3,
      degraded: false,
    },
    {
      id: "org-2",
      slug: "fedcba9876543210",
      name: "Personal",
      kind: "personal",
      role: "owner",
      memberCount: 1,
      degraded: false,
    },
  ],
  invites: [],
  ...over,
});

describe("connectEndpoints — public address grammar (C10)", () => {
  it("builds the three faces from the gateway origin", () => {
    deepStrictEqual(connectEndpoints(BASE, "my-agent", "fedcba9876543210"), {
      mcp: `${BASE}/mcp`,
      missions: `${BASE}/v1/agents/my-agent/missions`,
      a2aCard: `${BASE}/a2a/fedcba9876543210/my-agent/.well-known/agent-card.json`,
    });
  });

  it("a2aCard is null until the org slug is known", () => {
    strictEqual(connectEndpoints(BASE, "my-agent", null).a2aCard, null);
  });

  it("strips trailing slashes off the origin (no double slash)", () => {
    const eps = connectEndpoints(`${BASE}//`, "my-agent", "aa00bb11cc22dd33");
    strictEqual(eps.mcp, `${BASE}/mcp`);
    strictEqual(eps.missions, `${BASE}/v1/agents/my-agent/missions`);
  });

  it("percent-encodes slugs so a hostile name can't break the path", () => {
    const eps = connectEndpoints(BASE, "a/b?c", "x/y");
    strictEqual(eps.missions, `${BASE}/v1/agents/a%2Fb%3Fc/missions`);
    strictEqual(
      eps.a2aCard,
      `${BASE}/a2a/x%2Fy/a%2Fb%3Fc/.well-known/agent-card.json`,
    );
  });
});

describe("connectOrgSlug — active-space slug for the A2A path", () => {
  it("team workspace: the slug rides the workspace id", () => {
    strictEqual(
      connectOrgSlug("org:abcdef0123456789", orgsList()),
      "abcdef0123456789",
    );
  });

  it("personal workspace (opaque id): falls back to the personal membership", () => {
    strictEqual(connectOrgSlug("ws-opaque-id", orgsList()), "fedcba9876543210");
  });

  it("null while the orgs list hasn't loaded", () => {
    strictEqual(connectOrgSlug("ws-opaque-id", undefined), null);
  });

  it("null when no personal membership exists (pre-spaces host)", () => {
    strictEqual(
      connectOrgSlug("ws-opaque-id", { orgs: [], invites: [] }),
      null,
    );
  });

  it("no workspace loaded yet: personal membership still resolves", () => {
    strictEqual(connectOrgSlug(null, orgsList()), "fedcba9876543210");
    strictEqual(connectOrgSlug(undefined, orgsList()), "fedcba9876543210");
  });
});
