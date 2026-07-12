import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { AgentIR } from "@houston/agentstore-contract";
import { expect, test } from "vitest";
import { handlePortableFromStore } from "./portable-from-store";

/**
 * The "install from a link" host route, driven directly with a fabricated
 * request and a mock store `fetch`. Covers the happy map, a 404 not-found, a
 * malformed IR (422), an SSRF-blocked input (400, fetch never runs), a public
 * name resolving to a private IP (400, DNS vet), an upstream error not leaking
 * its body (502), and a store network failure (502).
 */

const API = "https://gateway.gethouston.ai";

/** A stub resolver returning a public address so tests never hit real DNS. */
const publicLookup = async () => ["93.184.216.34"];

/** The gateway's public route wraps the IR: { agent: AgentSummary, ir }. */
const exampleAgentSummary = {
  id: "a1",
  slug: "inbox-triage-helper",
  name: "Inbox Triage Helper",
  state: "published",
  visibility: "public",
};

const exampleAgentIr: AgentIR = {
  irVersion: "2.0.0",
  identity: {
    slug: "inbox-triage-helper",
    name: "Inbox Triage Helper",
    description:
      "Sorts a pasted batch of emails by urgency and drafts replies.",
    category: "productivity",
    tags: ["email"],
    creator: { displayName: "Avery Chen" },
  },
  instructions: "You are a calm, efficient inbox assistant.",
  skills: [
    { slug: "triage-emails", body: "---\ntitle: Triage\n---\nBucket emails." },
    { slug: "draft-replies", body: "---\ntitle: Reply\n---\nDraft replies." },
  ],
  learnings: [
    { id: "l1", text: "Replies under three sentences." },
    { id: "l2", text: "Finance emails are always urgent." },
  ],
  integrations: ["GMAIL"],
  provenance: { createdVia: "houston" },
};

function reqWith(body: unknown): IncomingMessage {
  const r = Readable.from([Buffer.from(JSON.stringify(body))]);
  return r as unknown as IncomingMessage;
}

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

function mockRes(): { res: ServerResponse; captured: () => Captured } {
  let status = 0;
  let chunk = "";
  const res = {
    writeHead(s: number) {
      status = s;
      return this;
    },
    end(buf?: Buffer | string) {
      if (buf) chunk = buf.toString();
    },
  } as unknown as ServerResponse;
  return {
    res,
    captured: () => ({ status, body: JSON.parse(chunk || "{}") }),
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("maps a fetched IR into { manifest, content }", async () => {
  let fetched = "";
  const fetchImpl = (async (url: string | URL) => {
    fetched = String(url);
    return jsonResponse(200, {
      agent: exampleAgentSummary,
      ir: exampleAgentIr,
    });
  }) as unknown as typeof fetch;

  const { res, captured } = mockRes();
  const handled = await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://store.gethouston.ai/a/inbox-triage-helper" }),
    res,
  );

  expect(handled).toBe(true);
  expect(fetched).toBe(
    "https://gateway.gethouston.ai/v1/agentstore/agents/inbox-triage-helper",
  );
  const { status, body } = captured();
  expect(status).toBe(200);
  const manifest = body.manifest as Record<string, unknown>;
  const content = body.content as Record<string, unknown>;
  expect(manifest.agentName).toBe("Inbox Triage Helper");
  expect(manifest.exporter).toBe("Avery Chen");
  expect(manifest.formatVersion).toBe(1);
  expect((content.skills as unknown[]).length).toBe(2);
  expect(content.routines).toEqual([]);
  expect((content.learnings as unknown[]).length).toBe(2);
  expect(content.claudeMd).toBe(exampleAgentIr.instructions);
});

test("resolves a bare slug against the configured store", async () => {
  let fetched = "";
  const fetchImpl = (async (url: string | URL) => {
    fetched = String(url);
    return jsonResponse(200, {
      agent: exampleAgentSummary,
      ir: exampleAgentIr,
    });
  }) as unknown as typeof fetch;
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "inbox-triage-helper" }),
    res,
  );
  expect(fetched).toBe(
    "https://gateway.gethouston.ai/v1/agentstore/agents/inbox-triage-helper",
  );
  expect(captured().status).toBe(200);
});

test("a store 404 surfaces a not-found error", async () => {
  const fetchImpl = (async () =>
    jsonResponse(404, { error: "not_found" })) as unknown as typeof fetch;
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://store.gethouston.ai/a/ghost" }),
    res,
  );
  const { status, body } = captured();
  expect(status).toBe(404);
  expect(String(body.error)).toContain("No published agent");
});

test("a malformed IR surfaces a 422", async () => {
  const fetchImpl = (async () =>
    jsonResponse(200, {
      irVersion: "9.9.9",
      junk: true,
    })) as unknown as typeof fetch;
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://store.gethouston.ai/a/broken" }),
    res,
  );
  expect(captured().status).toBe(422);
});

test("an SSRF-blocked link is rejected before any fetch", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return jsonResponse(200, {
      agent: exampleAgentSummary,
      ir: exampleAgentIr,
    });
  }) as unknown as typeof fetch;
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://169.254.169.254/a/steal" }),
    res,
  );
  expect(called).toBe(false);
  expect(captured().status).toBe(400);
});

test("a public host resolving to a private IP is rejected before any fetch", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return jsonResponse(200, {
      agent: exampleAgentSummary,
      ir: exampleAgentIr,
    });
  }) as unknown as typeof fetch;
  // The host is a public multi-label name (passes the string check) but resolves
  // to the cloud metadata address — the DNS vet must catch it.
  const lookup = async () => ["169.254.169.254"];
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://agent.evil.example/a/steal" }),
    res,
  );
  expect(called).toBe(false);
  const { status, body } = captured();
  expect(status).toBe(400);
  expect(String(body.error)).toContain("cannot open");
});

test("a non-ok store response surfaces a 502 without echoing its body", async () => {
  const fetchImpl = (async () =>
    jsonResponse(500, {
      error: "root:$6$secret-hash internal detail",
    })) as unknown as typeof fetch;
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://store.gethouston.ai/a/foo" }),
    res,
  );
  const { status, body } = captured();
  expect(status).toBe(502);
  expect(String(body.error)).toContain("500");
  expect(String(body.error)).not.toContain("secret-hash");
});

test("a store network failure surfaces a 502", async () => {
  const fetchImpl = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const { res, captured } = mockRes();
  await handlePortableFromStore(
    { apiUrl: API, fetchImpl, lookup: publicLookup },
    "POST",
    "/v1/portable/fetch-from-store",
    reqWith({ url: "https://store.gethouston.ai/a/foo" }),
    res,
  );
  const { status, body } = captured();
  expect(status).toBe(502);
  expect(String(body.error)).toContain("Could not reach");
});

test("does not handle unrelated method/paths", async () => {
  const { res } = mockRes();
  const handled = await handlePortableFromStore(
    { apiUrl: API },
    "GET",
    "/v1/portable/fetch-from-store",
    reqWith({}),
    res,
  );
  expect(handled).toBe(false);
});
