import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AGENT_ROLE_FAMILY, HttpDocShadow } from "./http-shadow";

/**
 * `publish` is the reporting put: a caller that announces a document (the
 * agent role) learns whether it actually landed in the gateway's store.
 */

const GATEWAY = {
  baseUrl: "https://store.example",
  orgSlug: "acme",
  agentSlug: "helper",
  podToken: "pod-token",
  bootId: "boot-1",
  fence: {},
};

type Handler = (method: string) => Response;

function shadowAnswering(handler: Handler): HttpDocShadow {
  const fetchImpl = async (_url: string | URL, init?: RequestInit) =>
    handler(init?.method ?? "GET");
  return new HttpDocShadow({
    gateway: GATEWAY,
    fetchImpl: fetchImpl as typeof fetch,
    retryDelaysMs: [],
  });
}

const unavailable = () =>
  Response.json({ error: "transcript store unavailable" }, { status: 503 });

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("an accepted PUT, or a doc already durable, reports landed", async () => {
  const shadow = shadowAnswering((method) =>
    method === "GET"
      ? Response.json({ doc: { role: "Chef" }, revision: 2 })
      : Response.json({ revision: 3 }),
  );
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBe("landed");
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Baker" }),
  ).resolves.toBe("landed");
});

test("an unavailable PUT reports deferred", async () => {
  const shadow = shadowAnswering((method) =>
    method === "GET" ? Response.json({ doc: {}, revision: 1 }) : unavailable(),
  );
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBe("deferred");
});

test("an unavailable seed reports deferred", async () => {
  const shadow = shadowAnswering(unavailable);
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBe("deferred");
});

test("a conflict that survives the retry reports deferred", async () => {
  const shadow = shadowAnswering((method) =>
    method === "GET"
      ? Response.json({ doc: {}, revision: 1 })
      : Response.json({ revision: 9 }, { status: 409 }),
  );
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBe("deferred");
});

test("a family the gateway does not know reports unsupported", async () => {
  const shadow = shadowAnswering(() =>
    Response.json({ error: "invalid document family" }, { status: 400 }),
  );
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBe("unsupported");
  await expect(
    shadow.publish(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBe("unsupported");
});

test("put keeps its fire-and-forget contract over publish", async () => {
  const shadow = shadowAnswering(unavailable);
  await expect(
    shadow.put(AGENT_ROLE_FAMILY, { role: "Chef" }),
  ).resolves.toBeUndefined();
});
