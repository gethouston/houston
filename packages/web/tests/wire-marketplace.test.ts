import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  json,
  ORG as ORG_SLUG,
} from "./support/wire-capture";

/**
 * The skills MARKETPLACE rides `sdk.skills.marketplace`. What this file pins
 * is the WIRE: five agent-scoped POSTs, their bodies byte for byte, and the
 * headers that carry
 * auth and the active space.
 *
 * Every case drives the composed `HoustonClient` (what the app holds), not the
 * SDK, and asserts the whole recorded request — the agent id is spliced into
 * the path, so a substring match would let an unescaped `Houston/Growth` pass
 * for the escaped segment the hosted gateway needs to find a pod.
 *
 * What stays ADAPTER-side is pinned alongside the wire: standalone web has no
 * marketplace backend, so the two reads answer empty and the three writes
 * refuse loudly; an install echoes `SkillsChanged` locally.
 */

const BASE = "https://gw.example";
const AGENT = "Houston/Growth";
const AGENT_PATH = `${BASE}/agents/Houston%2FGrowth/skills`;

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

/** A cloud client with a team space active, so `x-houston-org` is live. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG_SLUG);
  return c;
}

/** Standalone web: no control plane, so no marketplace backend exists. */
const standalone = () => new HoustonClient({ baseUrl: BASE, token: "t" });

const REPO_SKILL = {
  id: "weekly-report",
  name: "Weekly report",
  description: "Writes Monday's summary.",
  path: "skills/weekly-report",
};

/** Every delegated call carries the same auth and active-space headers. */
function expectHeaders(call: Call) {
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG_SLUG);
}

describe("marketplace reads ride the agent scope the gateway can proxy", () => {
  test("searchCommunitySkills POSTs the query under the escaped agent", async () => {
    stubFetch(() => json(200, []));

    await client().searchCommunitySkills(AGENT, "research");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${AGENT_PATH}/community/search`);
    expect(calls[0].body).toBe(JSON.stringify({ query: "research" }));
    expectHeaders(calls[0]);
  });

  test("previewCommunitySkill POSTs the catalogue source and skill id", async () => {
    stubFetch(() => json(200, { title: null }));

    await client().previewCommunitySkill(AGENT, "skills.sh/acme", "triage");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${AGENT_PATH}/community/preview`);
    expect(calls[0].body).toBe(
      JSON.stringify({ source: "skills.sh/acme", skillId: "triage" }),
    );
    expectHeaders(calls[0]);
  });

  test("listSkillsFromRepo POSTs the repository address", async () => {
    stubFetch(() => json(200, [REPO_SKILL]));

    await client().listSkillsFromRepo(AGENT, "https://github.com/acme/skills");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${AGENT_PATH}/repo/list`);
    expect(calls[0].body).toBe(
      JSON.stringify({ source: "https://github.com/acme/skills" }),
    );
    expectHeaders(calls[0]);
  });
});

describe("marketplace installs", () => {
  test("installCommunitySkill POSTs source + skillId and answers the slug", async () => {
    stubFetch(() => json(200, "inbox-triage"));

    const slug = await client().installCommunitySkill({
      workspacePath: AGENT,
      source: "skills.sh/acme",
      skillId: "inbox-triage",
    });

    expect(slug).toBe("inbox-triage");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${AGENT_PATH}/community/install`);
    expect(calls[0].body).toBe(
      JSON.stringify({ source: "skills.sh/acme", skillId: "inbox-triage" }),
    );
    expectHeaders(calls[0]);
  });

  test("installSkillsFromRepo POSTs the whole selection, once", async () => {
    stubFetch(() => json(200, ["weekly-report"]));

    const installed = await client().installSkillsFromRepo({
      workspacePath: AGENT,
      source: "https://github.com/acme/skills",
      skills: [REPO_SKILL],
    });

    expect(installed).toEqual(["weekly-report"]);
    // No post-write refetch: the install is the whole wire.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${AGENT_PATH}/repo/install`);
    expect(calls[0].body).toBe(
      JSON.stringify({
        source: "https://github.com/acme/skills",
        skills: [REPO_SKILL],
      }),
    );
    expectHeaders(calls[0]);
  });
});

describe("what stays adapter-side", () => {
  test("standalone web answers the reads empty without asking anything", async () => {
    stubFetch(() => json(200, []));
    const c = standalone();

    await expect(c.searchCommunitySkills(AGENT, "research")).resolves.toEqual(
      [],
    );
    await expect(c.listSkillsFromRepo(AGENT, "owner/repo")).resolves.toEqual(
      [],
    );
    expect(calls).toEqual([]);
  });

  test("standalone web refuses the writes loudly, never as a silent no-op", async () => {
    stubFetch(() => json(200, {}));
    const c = standalone();

    await expect(
      c.previewCommunitySkill(AGENT, "skills.sh/acme", "triage"),
    ).rejects.toThrow("Previewing skills needs a cloud workspace.");
    await expect(
      c.installCommunitySkill({
        workspacePath: AGENT,
        source: "s",
        skillId: "x",
      }),
    ).rejects.toThrow("Installing skills needs a cloud workspace.");
    await expect(
      c.installSkillsFromRepo({
        workspacePath: AGENT,
        source: "s",
        skills: [REPO_SKILL],
      }),
    ).rejects.toThrow("Installing skills needs a cloud workspace.");
    expect(calls).toEqual([]);
  });

  test("a failed search surfaces the host's reason with its status", async () => {
    stubFetch(() => json(502, { error: "skills.sh unavailable" }));

    await expect(
      client().searchCommunitySkills(AGENT, "research"),
    ).rejects.toThrow("skills.sh unavailable (engine error 502)");
  });
});
