import { irFromPortable } from "@houston/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isHoustonEngineError } from "./client";
import type { ControlPlaneConfig } from "./control-plane";
import { importFromStoreLink } from "./portable-from-store";

/**
 * The store-link install flow, driven with a fake `fetch` that routes by URL
 * path. In Node (no `window`) the store base resolves to `cfg.baseUrl`, so one
 * fake serves both the host route and the gateway's public IR route. Asserts
 * the host path is primary, and that the gateway's 501 ("not available on
 * hosted cloud") falls back to the direct public-IR fetch — the hosted/dev
 * topology where the engine base IS the gateway.
 */

// https + real-looking host: the direct fallback enforces the shared link
// policy on the store base (https only, no private/internal hosts).
const cfg: ControlPlaneConfig = {
  baseUrl: "https://gateway.test",
  token: "tok",
};

const ir = irFromPortable(
  {
    claudeMd: "# Role\nYou file taxes.",
    skills: [{ slug: "vat", body: "---\ntitle: VAT\n---\nbody" }],
    routines: [],
    learnings: [],
  },
  {
    identity: {
      name: "Tax Helper",
      description: "Files your taxes.",
      category: "productivity",
    },
    creator: { displayName: "Dana" },
    integrations: [],
    provenance: {
      createdVia: "houston",
      exporter: "houston-app",
      houstonVersion: "1.0.0",
      anonymized: false,
    },
  },
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let hostStatus: number;
let calls: string[] = [];

beforeEach(() => {
  hostStatus = 200;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v1/portable/fetch-from-store")) {
        if (hostStatus !== 200) {
          return jsonResponse(
            { error: "not available on hosted cloud" },
            hostStatus,
          );
        }
        return jsonResponse({
          manifest: {
            agentName: "From Host",
            description: "host path",
            exporter: "Dana",
            houstonVersion: "0.0.0",
            createdAt: "2026-01-01T00:00:00.000Z",
            anonymized: false,
            formatVersion: 1,
          },
          content: { skills: [], routines: [], learnings: [] },
        });
      }
      if (url === "https://gateway.test/v1/agentstore/agents/tax-helper") {
        return jsonResponse({ agent: { slug: "tax-helper" }, ir });
      }
      return jsonResponse({ error: "unexpected url" }, 500);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a local host serves the fetch; the store is never contacted directly", async () => {
  const preview = await importFromStoreLink(cfg, "tax-helper");
  expect(preview.manifest.agentName).toBe("From Host");
  expect(calls).toHaveLength(1);
});

test("the gateway's 501 falls back to the direct public-IR fetch", async () => {
  hostStatus = 501;
  const preview = await importFromStoreLink(cfg, "tax-helper");
  expect(preview.manifest.agentName).toBe("Tax Helper");
  expect(preview.manifest.exporter).toBe("Dana");
  expect(preview.preview.skills.map((s) => s.slug)).toEqual(["vat"]);
  expect(calls).toEqual([
    "https://gateway.test/v1/portable/fetch-from-store",
    "https://gateway.test/v1/agentstore/agents/tax-helper",
  ]);
});

test("the fallback resolves a full share link to its slug", async () => {
  hostStatus = 501;
  const preview = await importFromStoreLink(
    cfg,
    "https://agents.gethouston.ai/a/tax-helper",
  );
  expect(preview.manifest.agentName).toBe("Tax Helper");
});

test("a non-501 host failure surfaces as-is, without a fallback fetch", async () => {
  hostStatus = 404;
  const err = await importFromStoreLink(cfg, "tax-helper").catch((e) => e);
  expect(isHoustonEngineError(err)).toBe(true);
  expect((err as { status: number }).status).toBe(404);
  expect(calls).toHaveLength(1);
});
