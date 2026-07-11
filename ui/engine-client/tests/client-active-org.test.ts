import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";

/**
 * Active-space plumbing (C8 §Active space): `setActiveOrg` injects
 * `x-houston-org: <slug>` on EVERY HTTP request path — `request()`,
 * `rawRequest()`, and the ad-hoc `download`/`portablePackage` fetch sites —
 * and sends NO header when personal (`null`). Because the header is built
 * inside each per-attempt `build()` closure, a switch mid-flight lands on the
 * next retry.
 *
 * NB: the SSE `?org=` query fallback lives in the hosted event stream
 * (`packages/web/src/engine-adapter` `subscribeEvents`), NOT here — this
 * client's only stream is `wsUrl()` (`/v1/ws`), the local host's org-free
 * transport (C8: the gateway has no WebSocket). See
 * `packages/web/tests/active-org.test.ts` for the SSE-URL coverage.
 */

const SLUG = "0123456789abcdef"; // [a-f0-9]{16}

interface Captured {
  method: string;
  url: string;
  /** The `x-houston-org` header value, or `null` when absent. */
  org: string | null;
}

function makeClient(
  status = 200,
  retry?: Partial<{
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    deadlineMs: number;
  }>,
): {
  client: HoustonClient;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    retry,
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        org: new Headers(init?.headers).get("x-houston-org"),
      });
      return new Response(JSON.stringify({}), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

describe("HoustonClient active space — x-houston-org header", () => {
  it("sends NO header by default (personal org)", async () => {
    const { client, calls } = makeClient();
    await client.listWorkspaces();
    strictEqual(calls[0].org, null);
  });

  it("sends the slug header on request() after setActiveOrg", async () => {
    const { client, calls } = makeClient();
    client.setActiveOrg(SLUG);
    await client.listWorkspaces();
    strictEqual(calls[0].org, SLUG);
  });

  it("clears the header when switched back to personal (null)", async () => {
    const { client, calls } = makeClient();
    client.setActiveOrg(SLUG);
    await client.listWorkspaces();
    client.setActiveOrg(null);
    await client.listWorkspaces();
    strictEqual(calls[0].org, SLUG);
    strictEqual(calls[1].org, null);
  });

  it("injects the header on the rawRequest() path (import preview)", async () => {
    const { client, calls } = makeClient();
    client.setActiveOrg(SLUG);
    await client.importPreview(new Uint8Array([1, 2, 3]));
    strictEqual(calls[0].org, SLUG);
  });

  it("injects the header on the ad-hoc download fetch site", async () => {
    const { client, calls } = makeClient();
    client.setActiveOrg(SLUG);
    await client.downloadProjectFile("agent-1", "notes.txt");
    strictEqual(calls[0].org, SLUG);
  });

  it("injects the header on the portablePackage fetch site", async () => {
    const { client, calls } = makeClient();
    client.setActiveOrg(SLUG);
    await client.portablePackage("agent-1", {
      selection: {
        includeClaudeMd: false,
        includeSkillSlugs: [],
        includeRoutineIds: [],
        includeLearningIds: [],
      },
      meta: { agentId: "a", agentName: "A", anonymized: false },
    });
    strictEqual(calls[0].org, SLUG);
  });
});

describe("HoustonClient active space — per-attempt re-read", () => {
  it("a switch mid-flight is honored on the next retry (build runs per attempt)", async () => {
    const calls: Captured[] = [];
    let ref: HoustonClient | undefined;
    // Fast retry so the 503→200 replay resolves promptly.
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:9999",
      token: "tok",
      retry: { baseDelayMs: 1, maxDelayMs: 2, deadlineMs: 1000 },
      fetchImpl: async (url, init) => {
        calls.push({
          method: init?.method ?? "GET",
          url: String(url),
          org: new Headers(init?.headers).get("x-houston-org"),
        });
        // First attempt: 503 (retryable for a GET) — flip the active space
        // before the replay so we prove the header is rebuilt, not captured.
        if (calls.length === 1) {
          ref?.setActiveOrg("fedcba9876543210");
          return new Response("", { status: 503 });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    ref = client;
    client.setActiveOrg(SLUG);
    await client.listWorkspaces();
    strictEqual(calls.length, 2);
    strictEqual(calls[0].org, SLUG);
    strictEqual(calls[1].org, "fedcba9876543210");
  });
});
