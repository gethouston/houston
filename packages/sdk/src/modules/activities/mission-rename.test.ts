import { describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { memoryKv } from "../../test-ports";
import { moduleScope } from "../http";
import { ActivitiesHttpError } from "./http";
import { renameMission } from "./mission-rename";

const BASE = "http://127.0.0.1:4317";
const AGENT = "ag_1";

interface Recorded {
  method: string;
  path: string;
  /** The body VERBATIM: the pinned `{ title }` is a byte assertion, not a shape one. */
  body: string | null;
}

/**
 * `renameMission` is an exported module function, not a facade member (a facade
 * twin would be shadowed by the route `updateActivity` already claims), so the
 * test binds it the way `createActivitiesHttp` does: `moduleScope` over a stub
 * `fetch`, with `ActivitiesHttpError` as the family failure.
 */
function makeScope(respond: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        path: new URL(String(input)).pathname,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond();
    },
  );
  const ports = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } satisfies SdkPorts;
  const notifyExpired = vi.fn();
  const scope = moduleScope(
    { config: { baseUrl: BASE, ports }, authExpiry: { notifyExpired } },
    "activities",
    ActivitiesHttpError,
  );
  return { scope, calls, notifyExpired };
}

const activity = (title: string) =>
  new Response(JSON.stringify({ id: "m1", title, status: "running" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("renameMission — the narrow mission write", () => {
  it("PATCHes the mission with a body carrying only the title, in ONE request", async () => {
    const { scope, calls } = makeScope(() => activity("Reconcile invoices"));

    const renamed = await renameMission(
      scope,
      AGENT,
      "m1",
      "Reconcile invoices",
    );

    expect(calls).toEqual([
      {
        method: "PATCH",
        path: `/agents/${AGENT}/activities/m1`,
        body: '{"title":"Reconcile invoices"}',
      },
    ]);
    expect(renamed).toMatchObject({ id: "m1", title: "Reconcile invoices" });
  });

  it("percent-encodes both ids, so a slash in an id cannot forge a path segment", async () => {
    const { scope, calls } = makeScope(() => activity("T"));

    await renameMission(scope, "ag/1", "m/1", "T");

    expect(calls[0]?.path).toBe("/agents/ag%2F1/activities/m%2F1");
  });

  it("throws an ActivitiesHttpError carrying the status — a 404 never degrades", async () => {
    const { scope, notifyExpired } = makeScope(
      () => new Response("no such mission", { status: 404 }),
    );

    const err = await renameMission(scope, AGENT, "gone", "T").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ActivitiesHttpError);
    expect((err as ActivitiesHttpError).status).toBe(404);
    expect((err as ActivitiesHttpError).message).toBe("no such mission");
    expect(notifyExpired).not.toHaveBeenCalled();
  });
});
