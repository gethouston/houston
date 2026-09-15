import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * An agent's OWN skills and its skills manifest ride `sdk.skills.agent`.
 *
 * What these tests pin is the wire: the mixin method must issue exactly the
 * request recorded here, down to the URL, the method, the
 * body bytes and the auth/active-space headers — one request, never two. A slug
 * and an agent id are spliced into the path, so the percent-encoding is pinned
 * too: a slug with a slash must stay inside its own segment instead of forging
 * a route.
 *
 * Nothing here degrades a host failure. Skills are standing instructions and
 * the manifest is what the agent actually loads, so a create/save/delete that
 * did not happen must never be reported as one. The one adapter-side
 * degradation is the absence of a host at all (standalone web has no skill
 * backend), which is pinned at the bottom.
 */

const BASE = "http://host";
const AGENT = "a1";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

/** A hosted client with an active space pinned, as the app runs in cloud. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** Every header `cpFetch` stamped on a skills call, on the delegated one. */
/** A skill summary as the HOST sends it — without the two legacy fields. */
const HOST_SUMMARY = {
  name: "triage",
  title: "Triage",
  description: "Sort the inbox",
  version: 1,
  tags: ["inbox"],
  created: "2026-01-01T00:00:00.000Z",
  lastUsed: null,
  category: null,
  featured: false,
  integrations: ["gmail"],
  image: null,
};

const DETAIL = {
  name: "triage",
  title: "Triage",
  description: "Sort the inbox",
  version: 1,
  content: "# Triage\n",
};

describe("the delegated skill reads", () => {
  test("the list unwraps `items` off one GET and restores the legacy fields", async () => {
    stubFetch(() => json(200, { items: [HOST_SUMMARY] }));

    await expect(client().listSkills(AGENT)).resolves.toEqual([
      { ...HOST_SUMMARY, inputs: [], promptTemplate: null },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills`);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("loading one skill GETs its slug and answers the detail", async () => {
    stubFetch(() => json(200, DETAIL));

    await expect(client().loadSkill(AGENT, "triage")).resolves.toEqual(DETAIL);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills/triage`);
    expectGatewayHeaders(calls[0]);
  });

  test("a slug with a slash stays inside its own segment", async () => {
    stubFetch(() => json(200, DETAIL));

    await client().loadSkill("a 1", "my skill/v2");

    expect(calls[0].url).toBe(`${BASE}/agents/a%201/skills/my%20skill%2Fv2`);
  });
});

describe("the delegated skill writes", () => {
  test("creating POSTs the three fields and nothing else", async () => {
    stubFetch(() => json(200, {}));

    await client().createSkill({
      workspacePath: AGENT,
      name: "Triage",
      description: "Sort the inbox",
      content: "# Triage\n",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills`);
    expect(calls[0].body).toBe(
      JSON.stringify({
        name: "Triage",
        description: "Sort the inbox",
        content: "# Triage\n",
      }),
    );
    expectGatewayHeaders(calls[0]);
  });

  test("saving PUTs only the new text, at the slug's URL", async () => {
    stubFetch(() => json(200, {}));

    await client().saveSkill("triage", {
      workspacePath: AGENT,
      content: "# New\n",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills/triage`);
    expect(calls[0].body).toBe(JSON.stringify({ content: "# New\n" }));
    expectGatewayHeaders(calls[0]);
  });

  test("deleting sends no body", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().deleteSkill(AGENT, "triage");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills/triage`);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("a write that did not happen is never reported as one", async () => {
    stubFetch(() => json(500, { error: "disk full" }));

    const err = await client()
      .createSkill({
        workspacePath: AGENT,
        name: "Triage",
        description: "d",
        content: "c",
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.status).toBe(500);
    expect(err.body).toEqual({ error: "disk full" });
    // The path names an agent, so the translated error carries it — that is
    // what `provider-agent-gone.ts` and the stuck-wake tracker key on.
    expect(err.agentId).toBe(AGENT);
  });
});

describe("the delegated manifest calls", () => {
  const MANIFEST = { version: 1 as const, enabled: ["triage"] };

  test("reading GETs the manifest route", async () => {
    stubFetch(() => json(200, MANIFEST));

    await expect(client().getSkillsManifest(AGENT)).resolves.toEqual(MANIFEST);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills-manifest`);
    expectGatewayHeaders(calls[0]);
  });

  test("writing PUTs the whole manifest and echoes the host's answer", async () => {
    stubFetch(() => json(200, MANIFEST));

    await expect(client().putSkillsManifest(AGENT, MANIFEST)).resolves.toEqual(
      MANIFEST,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/agents/${AGENT}/skills-manifest`);
    expect(calls[0].body).toBe(JSON.stringify(MANIFEST));
    expectGatewayHeaders(calls[0]);
  });

  test("a rejected manifest reaches the caller as the host's 400", async () => {
    stubFetch(() => json(400, { error: "unknown slug" }));

    const err = await client()
      .putSkillsManifest(AGENT, MANIFEST)
      .catch((e) => e);

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.status).toBe(400);
    expect(err.body).toEqual({ error: "unknown slug" });
  });
});

describe("off-cloud, where there is no skill backend", () => {
  const solo = () => new HoustonClient({ baseUrl: BASE, token: "t" });

  test("the reads are empty and the writes quietly no-op", async () => {
    stubFetch(() => json(200, {}));

    await expect(solo().listSkills(AGENT)).resolves.toEqual([]);
    await expect(solo().loadSkill(AGENT, "triage")).resolves.toEqual({
      name: "triage",
      title: null,
      description: "",
      version: 1,
      content: "",
    });
    await solo().createSkill({
      workspacePath: AGENT,
      name: "n",
      description: "d",
      content: "c",
    });
    await solo().saveSkill("triage", { workspacePath: AGENT, content: "c" });
    await solo().deleteSkill(AGENT, "triage");

    expect(calls).toEqual([]);
  });

  test("the manifest calls refuse — there is nothing to enable against", async () => {
    await expect(solo().getSkillsManifest(AGENT)).rejects.toThrow(
      "Skills manifests need a host agent.",
    );
    await expect(
      solo().putSkillsManifest(AGENT, { version: 1, enabled: [] }),
    ).rejects.toThrow("Skills manifests need a host agent.");
  });
});
