import { expect, test } from "vitest";
import { parseOpRequest } from "./parse-op-request";

test("op.rest must be an op-route shape; a runtime agentfile path is refused", () => {
  const base = {
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
  };
  const routeOp = (rest: string, method = "PUT") => ({
    ...base,
    op: {
      kind: "route",
      method,
      rest,
      contentType: "application/json",
      body: "{}",
    },
  });
  expect(() =>
    parseOpRequest(routeOp("agentfile/data-schema.md")),
  ).not.toThrow();
  expect(() => parseOpRequest(routeOp("routines", "POST"))).not.toThrow();
  expect(() =>
    parseOpRequest(routeOp("agentfile/.houston/runtime/auth.json")),
  ).toThrow(/not an op route/);
  expect(() =>
    parseOpRequest(routeOp("conversations/c1/messages", "POST")),
  ).toThrow(/not an op route/);
});

test("tranche-2 route allowlist: portable/migration/custom in, OAuth start out", () => {
  const base = {
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
  };
  const routeOp = (rest: string, method: string, extra?: object) => ({
    ...base,
    op: { kind: "route", method, rest, ...extra },
  });
  for (const [rest, method] of [
    ["portable/preview", "GET"],
    ["portable/export", "POST"],
    ["portable/store-ir", "POST"],
    ["portable/store-publication", "GET"],
    ["portable/store-publication", "POST"],
    ["portable/store-publication", "DELETE"],
    ["migration/export", "POST"],
    ["migration/complete", "POST"],
    ["migration/status", "GET"],
    ["integrations/custom/detect", "POST"],
    ["integrations/custom/definitions", "GET"],
    ["integrations/custom/definitions", "POST"],
    ["integrations/custom/definitions/acme", "DELETE"],
    ["integrations/custom/definitions/acme/credential", "POST"],
    ["integrations/custom/definitions/acme/tools", "GET"],
  ] as const) {
    expect(() => parseOpRequest(routeOp(rest, method)), rest).not.toThrow();
  }
  // OAuth sign-in stays pod-side: its pending state lives in pod memory,
  // where the browser callback lands.
  expect(() =>
    parseOpRequest(
      routeOp("integrations/custom/definitions/acme/oauth/start", "POST"),
    ),
  ).toThrow(/not an op route/);
  // portable/anonymize is its own op kind, never a route.
  expect(() => parseOpRequest(routeOp("portable/anonymize", "POST"))).toThrow(
    /not an op route/,
  );
  // Binary bodies ride bodyBase64 for the migration import ONLY.
  expect(() =>
    parseOpRequest(routeOp("migration/import", "POST", { bodyBase64: "AAAA" })),
  ).not.toThrow();
  expect(() =>
    parseOpRequest(routeOp("routines", "POST", { bodyBase64: "AAAA" })),
  ).toThrow(/bodyBase64/);
});

test("the endpoint and anonymize kinds parse; azure's endpoint rides the credential op", () => {
  const base = {
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
  };
  const endpoint = parseOpRequest({
    ...base,
    op: {
      kind: "settings",
      action: "endpoint",
      input: { baseUrl: "https://m.example.com", model: "m1", shared: true },
    },
  });
  expect(endpoint.op).toMatchObject({
    kind: "settings",
    action: "endpoint",
    input: { baseUrl: "https://m.example.com", model: "m1", shared: true },
  });
  const anonymize = parseOpRequest({
    ...base,
    op: { kind: "anonymize", input: { claudeMd: true, useAi: false } },
  });
  expect(anonymize.op).toMatchObject({
    kind: "anonymize",
    input: { claudeMd: true, useAi: false, skillSlugs: [] },
  });
  const azure = parseOpRequest({
    ...base,
    op: {
      kind: "credential",
      action: "api-key",
      provider: "azure-openai-responses",
      apiKey: "sk",
      endpoint: "https://r.openai.azure.com",
    },
  });
  expect(azure.op).toMatchObject({ endpoint: "https://r.openai.azure.com" });
});
