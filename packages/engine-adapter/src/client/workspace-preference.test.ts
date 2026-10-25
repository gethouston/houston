import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoustonClient } from "../client";

const key = "last_workspace_id";
const localKey = `houston.pref.${key}`;
const team = "org:aaaaaaaaaaaaaaaa";
const spaces = [
  { id: "default", isDefault: true },
  { id: team, isDefault: false },
];
let device: Map<string, string>;
let stored: string | null;
let methods: string[];
let failRead: boolean;
let headers: Headers[];

beforeEach(() => {
  device = new Map();
  stored = null;
  methods = [];
  headers = [];
  failRead = false;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => device.get(k) ?? null,
    setItem: (k: string, value: string) => device.set(k, value),
    removeItem: (k: string) => device.delete(k),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`http://host/v1/preferences/${key}`);
      methods.push(init?.method ?? "GET");
      headers.push(new Headers(init?.headers));
      if (failRead && init?.method !== "PUT")
        return Response.json({ error: "denied" }, { status: 403 });
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body)).value;
      }
      return Response.json({ value: stored });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

for (const controlPlane of [true, false]) {
  describe(
    controlPlane ? "hosted space choice" : "desktop space choice",
    () => {
      const client = () => {
        const c = new HoustonClient({
          baseUrl: "http://host",
          token: "t",
          controlPlane,
        });
        c.setActiveOrg("bbbbbbbbbbbbbbbb");
        return c;
      };
      it("resolves an unset account to the first team", async () => {
        expect((await client().resolveWorkspaceSelection(spaces))?.id).toBe(
          team,
        );
        expect(methods).toEqual(["GET"]);
      });
      it("moves a legacy team to the device without account writes", async () => {
        device.set(localKey, team);
        const c = client();
        expect((await c.resolveWorkspaceSelection(spaces))?.id).toBe(team);
        expect(device.has(localKey)).toBe(false);
        expect((await c.resolveWorkspaceSelection(spaces))?.id).toBe(team);
        expect(methods).toEqual(["GET", "GET"]);
        expect(headers.every((h) => !h.has("x-houston-org"))).toBe(true);
      });
      it("drops an old-build automatic default without saving a choice", async () => {
        device.set(localKey, "default");
        expect((await client().resolveWorkspaceSelection(spaces))?.id).toBe(
          team,
        );
        expect(device.has(localKey)).toBe(false);
        expect(stored).toBeNull();
        expect(methods).toEqual(["GET"]);
      });
      it.each([
        null,
        team,
      ])("keeps device behaviour when the account read fails: %s", async (legacy) => {
        if (legacy) device.set(localKey, legacy);
        failRead = true;
        expect((await client().resolveWorkspaceSelection(spaces))?.id).toBe(
          team,
        );
        expect(methods).toEqual(["GET"]);
        expect(device.has(localKey)).toBe(false);
      });
      it("remembers this device's last choice for a later account outage", async () => {
        const c = client();
        await c.setPreference(key, team);
        failRead = true;
        expect((await client().resolveWorkspaceSelection(spaces))?.id).toBe(
          team,
        );
        expect(methods).toEqual(["PUT", "GET"]);
      });
      it("lets the account choice win over a stale device copy", async () => {
        device.set(localKey, team);
        stored = "default";
        expect((await client().resolveWorkspaceSelection(spaces))?.id).toBe(
          "default",
        );
        expect(methods).toEqual(["GET"]);
      });
      it("writes the choice to the account and retains its device copy", async () => {
        device.set(localKey, "default");
        await client().setPreference(key, team);
        expect(stored).toBe(team);
        expect(JSON.parse(device.get(`${localKey}.device`) ?? "null")).toEqual({
          value: team,
          accountWriteSucceeded: true,
        });
        expect(methods).toEqual(["PUT"]);
      });
    },
  );
}

it("serializes rapid deliberate switches so the final choice wins", async () => {
  const c = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  const pending: Array<() => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) =>
          pending.push(() => {
            stored = JSON.parse(String(init?.body)).value;
            resolve(Response.json({ value: stored }));
          }),
        ),
    ),
  );
  const first = c.setPreference(key, team);
  const second = c.setPreference(key, "default");
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
  const inFlight = pending.length;
  pending.shift()?.();
  await first;
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
  pending.shift()?.();
  await second;
  expect(inFlight).toBe(1);
  expect(stored).toBe("default");
});
