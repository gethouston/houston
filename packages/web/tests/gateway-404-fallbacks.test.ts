import { afterEach, expect, test, vi } from "vitest";
import {
  HoustonClient,
  HoustonEngineError,
} from "../src/engine-adapter/client";
import {
  getMyProfile,
  getSkillsManifest,
  listInstalledConfigs,
  putSkillsManifest,
} from "../src/engine-adapter/control-plane";

/**
 * HOU-688: two desktop calls 404'd against the hosted gateway and red-toasted
 * "not found (engine error 404)".
 *
 * - `version()` rode the runtime-protocol client, whose path is `/version` —
 *   a route only the pi runtime serves. The host's and the gateway's meta
 *   surface is `/v1/version`, so the probe 404'd against EVERY host and the
 *   migration-reconnect signal was permanently "unknown".
 * - `/v1/agent-configs` has no gateway disposition (one pod per agent — no
 *   account-level config library), so the create-agent picker's library read
 *   404'd and toasted. Nothing installed is the honest answer there, exactly
 *   like standalone web.
 *
 * Later reads joined the same posture: `/v1/org/people` (the @mention roster)
 * and `/v1/me/profile` (the caller's own editable name + photo) both degrade
 * on a gateway that predates them rather than toast.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub fetch with a queue of responses; records every requested url. */
function stubFetch(...responses: Response[]) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://gateway.example", token: "t" };

test("version() asks the host meta surface /v1/version, not the runtime's /version", async () => {
  const calls = stubFetch(
    json(200, { engine: "houston-gateway", protocol: 3, build: null }),
  );
  const client = new HoustonClient({ ...CFG, controlPlane: true });

  const version = (await client.version()) as { engine: string };

  expect(calls).toEqual(["https://gateway.example/v1/version"]);
  expect(version.engine).toBe("houston-gateway");
});

test("version() surfaces a real failure with the host's reason", async () => {
  stubFetch(json(500, { error: "boom" }));
  const client = new HoustonClient({ ...CFG, controlPlane: true });

  await expect(client.version()).rejects.toThrow("boom (engine error 500)");
});

test("a 404 on /v1/agent-configs reads as an empty library — no toast (HOU-688)", async () => {
  stubFetch(json(404, { error: "not found" }));

  await expect(listInstalledConfigs(CFG)).resolves.toEqual([]);
});

test("every other agent-configs failure still propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "library exploded" }));

  await expect(listInstalledConfigs(CFG)).rejects.toThrow(HoustonEngineError);
  stubFetch(json(500, { error: "library exploded" }));
  await expect(listInstalledConfigs(CFG)).rejects.toThrow(
    "library exploded (engine error 500)",
  );
});

/**
 * HOU-944: the @mention roster read has the same degrade posture as
 * `getOrgProfiles` — a gateway that predates `/v1/org/people` (and a
 * single-player deployment, which has no control plane at all) simply has
 * nobody to mention, so `@` types plainly and no popover ever opens. A real
 * failure still propagates; the roster is not important enough to lie about.
 */

test("getOrgPeople reads the space roster from /v1/org/people", async () => {
  const calls = stubFetch(
    json(200, {
      people: [
        { userId: "u1", displayName: "Ada Lovelace", photoUrl: "https://p/1" },
        { userId: "u2" },
      ],
    }),
  );
  const client = new HoustonClient({ ...CFG, controlPlane: true });

  await expect(client.getOrgPeople()).resolves.toEqual([
    { userId: "u1", displayName: "Ada Lovelace", photoUrl: "https://p/1" },
    { userId: "u2" },
  ]);
  expect(calls).toEqual(["https://gateway.example/v1/org/people"]);
});

test("a 404 on /v1/org/people reads as an empty roster — no toast", async () => {
  stubFetch(json(404, { error: "not found" }));
  const client = new HoustonClient({ ...CFG, controlPlane: true });

  await expect(client.getOrgPeople()).resolves.toEqual([]);
});

test("getOrgPeople is empty off-cloud, and propagates every other failure", async () => {
  // No control plane: single-player, nobody to mention.
  const solo = new HoustonClient({ ...CFG });
  await expect(solo.getOrgPeople()).resolves.toEqual([]);

  stubFetch(json(500, { error: "roster exploded" }));
  const client = new HoustonClient({ ...CFG, controlPlane: true });
  await expect(client.getOrgPeople()).rejects.toThrow(
    "roster exploded (engine error 500)",
  );
});

/**
 * The editable-profile read has the same degrade posture: a gateway predating
 * `/v1/me/profile` simply has no profile to edit, so the Settings profile
 * section hides instead of red-toasting. A real failure still propagates — the
 * section is not important enough to lie about.
 */

test("a 404 on /v1/me/profile hides the profile section — no toast", async () => {
  const calls = stubFetch(json(404, { error: "not found" }));

  await expect(getMyProfile(CFG)).resolves.toBeNull();
  expect(calls).toEqual(["https://gateway.example/v1/me/profile"]);
});

test("every other /v1/me/profile failure still propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "profile exploded" }));

  await expect(getMyProfile(CFG)).rejects.toThrow(HoustonEngineError);
  stubFetch(json(500, { error: "profile exploded" }));
  await expect(getMyProfile(CFG)).rejects.toThrow(
    "profile exploded (engine error 500)",
  );
});

/**
 * HOU-1105 (Sentry HOUSTON-APP-544): the per-agent shared-skills manifest
 * route shipped with HOU-1027, but cloud engine pods pick it up only as they
 * re-wake onto the new image — a freshly auto-updated desktop talking to an
 * old pod 404'd and red-toasted on a read the user never initiated. A missing
 * manifest means "nothing enabled" (ADR 0003), so the read degrades to the
 * empty manifest; the write stays loud so a toggle never silently no-ops.
 */

test("a 404 on the skills-manifest read is the empty manifest — no toast (HOU-1105)", async () => {
  const calls = stubFetch(json(404, { error: "not found" }));

  await expect(getSkillsManifest(CFG, "a1")).resolves.toEqual({
    version: 1,
    enabled: [],
  });
  expect(calls).toEqual(["https://gateway.example/agents/a1/skills-manifest"]);
});

test("every other skills-manifest read failure still propagates", async () => {
  stubFetch(json(500, { error: "manifest exploded" }));

  await expect(getSkillsManifest(CFG, "a1")).rejects.toThrow(
    "manifest exploded (engine error 500)",
  );
});

test("the skills-manifest WRITE still surfaces a 404 — a toggle must never silently no-op", async () => {
  stubFetch(json(404, { error: "not found" }));

  await expect(
    putSkillsManifest(CFG, "a1", { version: 1, enabled: ["research"] }),
  ).rejects.toThrow("not found (engine error 404)");
});
