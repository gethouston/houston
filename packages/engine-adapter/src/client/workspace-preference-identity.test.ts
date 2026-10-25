import { afterEach, expect, it, vi } from "vitest";
import { HoustonClient } from "../client";

const key = "last_workspace_id";
const team = "org:aaaaaaaaaaaaaaaa";
const token = (sub: string, rotation = 0) =>
  `e30.${btoa(JSON.stringify({ sub, rotation }))}.sig`;
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const pending: Array<() => void> = [];
  const sent: Array<{ bearer: string | null; value: string }> = [];
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => local.set(k, v),
    removeItem: (k: string) => local.delete(k),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const value = JSON.parse(String(init?.body)).value;
      sent.push({
        bearer: new Headers(init?.headers).get("Authorization"),
        value,
      });
      return new Promise<Response>((resolve) =>
        pending.push(() => resolve(Response.json({ value }))),
      );
    }),
  );
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: token("A"),
    controlPlane: true,
  });
  return { client, pending, sent };
}

it("drops a queued choice when the live client changes identity", async () => {
  const { client, pending, sent } = setup();
  const first = client.setPreference(key, team);
  const queued = client.setPreference(key, "default").catch((error) => error);
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  client.setEndpoint({ baseUrl: "http://host", token: token("B") });
  pending.shift()?.();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 10));
  // Release a wrongly sent request too, so the failing test leaves no work behind.
  pending.shift()?.();
  await queued;
  expect(sent).toEqual([{ bearer: `Bearer ${token("A")}`, value: team }]);
});

it("keeps selection writes ordered across a same-user SDK rebuild", async () => {
  const { client, pending, sent } = setup();
  const first = client.setPreference(key, team);
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  client.setEndpoint({ baseUrl: "http://host", token: token("A", 1) });
  const last = client.setPreference(key, "default");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const inFlight = sent.length;
  pending.shift()?.();
  await first;
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  pending.shift()?.();
  await last;
  expect(inFlight).toBe(1);
  expect(sent[1]).toEqual({
    bearer: `Bearer ${token("A", 1)}`,
    value: "default",
  });
});

it("never replays a choice under a different account after a 401 refresh", async () => {
  const { client } = setup();
  vi.stubGlobal("window", {
    __HOUSTON_CP__: true,
    __HOUSTON_ENGINE__: { baseUrl: "http://host", token: token("A") },
    __HOUSTON_SESSION_REFRESH__: async () => token("B"),
  });
  const answer = vi.fn(async () =>
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  vi.stubGlobal("fetch", answer);
  await expect(client.setPreference(key, team)).rejects.toMatchObject({
    status: 401,
  });
  expect(answer).toHaveBeenCalledTimes(1);
});
