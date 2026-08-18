import { afterEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import { teamSlugFromWorkspaceId } from "../src/engine-adapter/client/workspaces-mixin";

/**
 * PRODUCT-1410 — "Workspace is not being deleted".
 *
 * `deleteWorkspace` on the v3 adapter used to be `async () => {}`: the Settings
 * Danger Zone "succeeded", dropped the row from the local store, and the team
 * space came straight back on the next spaces refresh (it was never touched
 * server-side). The posture now: a team row (`org:<slug>`) issues the real
 * `DELETE /v1/orgs/:slug` and lets every rejection propagate; the personal row
 * and an off-cloud client THROW instead of pretending.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function stubFetch(status: number, body: unknown = {}) {
  const calls: { url: string; method: string | undefined }[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://gateway.example", token: "t" };
const cloud = () => new HoustonClient({ ...CFG, controlPlane: true });
const local = () => new HoustonClient({ ...CFG, controlPlane: false });

const TEAM_ID = "org:00112233aabbccdd";

test("teamSlugFromWorkspaceId reads only the C8 team-id grammar", () => {
  expect(teamSlugFromWorkspaceId(TEAM_ID)).toBe("00112233aabbccdd");
  expect(teamSlugFromWorkspaceId("default")).toBeNull();
  expect(teamSlugFromWorkspaceId("Houston")).toBeNull();
  expect(teamSlugFromWorkspaceId("org:")).toBeNull();
  expect(teamSlugFromWorkspaceId("org:not-hex-slug!")).toBeNull();
});

test("a team row issues DELETE /v1/orgs/:slug on the gateway and resolves on 204", async () => {
  const calls = stubFetch(204);

  await expect(cloud().deleteWorkspace(TEAM_ID)).resolves.toBeUndefined();

  expect(calls).toEqual([
    {
      url: "https://gateway.example/v1/orgs/00112233aabbccdd",
      method: "DELETE",
    },
  ]);
});

test("a gateway rejection propagates with its code — never a silent success", async () => {
  stubFetch(409, { error: "members remain", code: "has_members", members: 2 });

  const err = await cloud()
    .deleteWorkspace(TEAM_ID)
    .catch((e: unknown) => e);

  expect(err).toBeInstanceOf(HoustonEngineError);
  expect((err as HoustonEngineError).status).toBe(409);
  expect((err as HoustonEngineError).body).toMatchObject({
    code: "has_members",
  });
});

test("the personal row is never deletable — throws without touching the wire", async () => {
  const calls = stubFetch(204);

  await expect(cloud().deleteWorkspace("default")).rejects.toThrow(
    /personal workspace can't be deleted/,
  );
  expect(calls).toEqual([]);
});

test("off-cloud there is no gateway to delete a team on — throws, no wire call", async () => {
  const calls = stubFetch(204);

  await expect(local().deleteWorkspace(TEAM_ID)).rejects.toThrow(
    /needs the hosted gateway/,
  );
  expect(calls).toEqual([]);
});
