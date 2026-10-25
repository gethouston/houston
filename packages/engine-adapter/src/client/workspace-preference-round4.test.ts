import { afterEach, expect, it, vi } from "vitest";
import { HoustonClient } from "../client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each([
  "GET",
  "PUT",
])("a selection %s uses the normal transient retry ladder", async (method) => {
  vi.useFakeTimers();
  const answer = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: "handoff" }, { status: 503 }))
    .mockResolvedValue(Response.json({ value: "default" }));
  vi.stubGlobal("fetch", answer);
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  const result = (
    method === "GET"
      ? client.getPreference("last_workspace_id")
      : client.setPreference("last_workspace_id", "default")
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).not.toBeInstanceOf(Error);
  expect(answer).toHaveBeenCalledTimes(2);
});

it("a transient retry never sends a choice under a replacement account", async () => {
  vi.useFakeTimers();
  const token = (sub: string) => `e30.${btoa(JSON.stringify({ sub }))}.sig`;
  const device = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => device.get(key) ?? null,
    setItem: (key: string, value: string) => device.set(key, value),
    removeItem: (key: string) => device.delete(key),
  });
  const answer = vi.fn(async () =>
    Response.json({ error: "handoff" }, { status: 503 }),
  );
  vi.stubGlobal("fetch", answer);
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: token("A"),
    controlPlane: true,
  });
  const write = client
    .setPreference("last_workspace_id", "default")
    .catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  expect(answer).toHaveBeenCalledTimes(1);
  client.setEndpoint({ baseUrl: "http://host", token: token("B") });
  await vi.advanceTimersByTimeAsync(2000);
  expect(await write).toMatchObject({
    name: "WorkspacePreferenceIdentityChanged",
  });
  expect(answer).toHaveBeenCalledTimes(1);
});
