import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { StorePublishRequest } from "../../../../ui/engine-client/src/types";
import type { ControlPlaneConfig } from "./control-plane";
import {
  getPublication,
  publishToStore,
  unpublishFromStore,
} from "./portable-store";

/**
 * The account-based Agent Store orchestration in the web adapter, driven with a
 * fake `fetch` that routes by URL path. In Node (no `window`) both the host
 * gather routes and the gateway store routes resolve against `cfg.baseUrl`, so
 * one fake serves both. Asserts publish gathers the IR then POSTs it and records
 * the pointer, and that manage status merges the pointer with the live listing.
 */

const cfg: ControlPlaneConfig = { baseUrl: "http://host", token: "tok" };

const req: StorePublishRequest = {
  selection: {
    includeClaudeMd: true,
    includeSkillSlugs: ["mailer"],
    includeRoutineIds: [],
    includeLearningIds: [],
  },
  identity: {
    name: "Mailer",
    description: "Sends mail on your behalf.",
    category: "productivity",
    tags: [],
  },
  creator: { displayName: "Dana" },
};

let pointer: unknown = null;
let posts: { url: string; body: unknown }[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  pointer = null;
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (method !== "GET") posts.push({ url, body });

      if (url.endsWith("/agents/A/portable/store-ir")) {
        return jsonResponse({ ir: { irVersion: "2.0.0", from: body } });
      }
      if (url.endsWith("/agents/A/portable/store-publication")) {
        if (method === "GET") return jsonResponse({ pointer });
        if (method === "DELETE") {
          pointer = null;
          return jsonResponse({ ok: true });
        }
        pointer = body;
        return jsonResponse({ ok: true });
      }
      if (url.endsWith("/v1/agentstore/agents") && method === "POST") {
        return jsonResponse({
          agentId: "S1",
          slug: "mailer",
          shareUrl: "https://agents.gethouston.ai/a/mailer",
        });
      }
      if (url.includes("/v1/agentstore/agents/S1") && method === "PATCH") {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith("/v1/agentstore/me/agents")) {
        return jsonResponse({
          items: [
            {
              id: "S1",
              slug: "mailer",
              name: "Mailer",
              description: "Sends mail on your behalf.",
              category: "productivity",
              tags: [],
              state: "published",
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("publish gathers the IR, POSTs it to the gateway, and records the pointer", async () => {
  const res = await publishToStore(cfg, "A", req);
  expect(res).toEqual({
    shareUrl: "https://agents.gethouston.ai/a/mailer",
    slug: "mailer",
    storeAgentId: "S1",
  });
  // The gateway POST carried the gathered IR + publish flag.
  const post = posts.find((p) => p.url.endsWith("/v1/agentstore/agents"));
  expect((post?.body as { publish: boolean }).publish).toBe(true);
  expect((post?.body as { ir: { irVersion: string } }).ir.irVersion).toBe(
    "2.0.0",
  );
  // The token-free pointer was written to the host.
  expect(pointer).toMatchObject({
    storeAgentId: "S1",
    slug: "mailer",
    shareUrl: "https://agents.gethouston.ai/a/mailer",
  });
});

test("a kept pointer re-publishes the SAME store agent (no duplicate POST)", async () => {
  pointer = {
    storeAgentId: "S1",
    slug: "mailer",
    shareUrl: "https://agents.gethouston.ai/a/mailer",
    publishedAt: "2026-07-09T00:00:00.000Z",
  };
  const res = await publishToStore(cfg, "A", req);
  expect(res.storeAgentId).toBe("S1");
  expect(posts.some((p) => p.url.endsWith("/v1/agentstore/agents"))).toBe(
    false,
  );
  expect(posts.some((p) => p.url.includes("/v1/agentstore/agents/S1"))).toBe(
    true,
  );
});

test("getPublication merges the pointer with the live listing", async () => {
  pointer = {
    storeAgentId: "S1",
    slug: "mailer",
    shareUrl: "https://agents.gethouston.ai/a/mailer",
    publishedAt: "2026-07-09T00:00:00.000Z",
  };
  const status = await getPublication(cfg, "A");
  expect(status.published).toBe(true);
  expect(status.linked).toBe(true);
  expect(status.storeAgentId).toBe("S1");
  expect(status.identity?.name).toBe("Mailer");
});

test("getPublication on a never-published agent needs no store call", async () => {
  const status = await getPublication(cfg, "A");
  expect(status).toEqual({
    published: false,
    linked: false,
    storeUrl: "https://agents.gethouston.ai",
  });
});

test("unpublish PATCHes the gateway and keeps the pointer", async () => {
  pointer = {
    storeAgentId: "S1",
    slug: "mailer",
    shareUrl: "https://agents.gethouston.ai/a/mailer",
    publishedAt: "2026-07-09T00:00:00.000Z",
  };
  const res = await unpublishFromStore(cfg, "A");
  expect(res.ok).toBe(true);
  const patch = posts.find((p) => p.url.includes("/v1/agentstore/agents/S1"));
  expect((patch?.body as { unpublish: boolean }).unpublish).toBe(true);
  expect(pointer).not.toBeNull();
});
