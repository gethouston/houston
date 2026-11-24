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
  expect(() =>
    parseOpRequest(
      routeOp("integrations/custom/definitions/acme/oauth/start", "POST"),
    ),
  ).toThrow(/not an op route/);
  expect(() =>
    parseOpRequest(routeOp("migration/import", "POST", { bodyBase64: "AAAA" })),
  ).not.toThrow();
  expect(() =>
    parseOpRequest(routeOp("routines", "POST", { bodyBase64: "AAAA" })),
  ).toThrow(/bodyBase64/);
  expect(() =>
    parseOpRequest(routeOp("migration/import", "POST", { body: "PK..." })),
  ).toThrow(/bodyBase64/);
  expect(() =>
    parseOpRequest(routeOp("migration/import", "POST", { body: "" })),
  ).not.toThrow();
});

test("the endpoint kind parses; azure's endpoint rides the credential op", () => {
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

test("actingAs.via: only the assistant marker survives, anything else reads as absent", () => {
  const envelope = (actingAs: unknown) => ({
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
    actingAs,
    op: { kind: "route", method: "POST", rest: "activities", body: "{}" },
  });
  expect(
    parseOpRequest(envelope({ userId: "u1", name: "Ada", via: "assistant" }))
      .actingAs,
  ).toEqual({ userId: "u1", name: "Ada", via: "assistant" });
  expect(parseOpRequest(envelope({ userId: "u1" })).actingAs).toEqual({
    userId: "u1",
  });
  for (const via of ["employee", "", "ASSISTANT", 1, null, { a: 1 }]) {
    expect(
      parseOpRequest(envelope({ userId: "u1", via })).actingAs,
      JSON.stringify(via),
    ).toEqual({ userId: "u1" });
  }
  expect(
    parseOpRequest(envelope({ via: "assistant" })).actingAs,
  ).toBeUndefined();
});

const oauthEnvelope = (op: unknown, extra: object = {}) => ({
  workspaceId: "w1",
  agentId: "a1",
  gcsPrefix: "ws/org1/a1",
  hostToken: "ht",
  claim: {
    id: "c",
    bootId: "b",
    token: "t",
    heartbeatUrl: "https://gateway.example/hb",
  },
  op,
  ...extra,
});
const callback =
  "https://gateway.example/v1/integrations/custom/oauth/callback";
const validAttempt = {
  slug: "acme",
  endpoint: "https://mcp.example/mcp",
  codeVerifier: "verifier",
  redirectUri: callback,
  authorizationServerUrl: "https://auth.example",
  client: { client_id: "client", redirect_uris: [callback] },
  expiresAtMs: 123,
};

test("custom OAuth kinds and callback envelope validate every input", () => {
  expect(
    parseOpRequest(
      oauthEnvelope({
        kind: "custom-oauth",
        action: "start",
        slug: "acme",
        callbackUrl: callback,
      }),
    ).op,
  ).toEqual({
    kind: "custom-oauth",
    action: "start",
    slug: "acme",
    callbackUrl: callback,
  });
  expect(
    parseOpRequest(
      oauthEnvelope({
        kind: "custom-oauth",
        action: "complete",
        attempt: validAttempt,
        code: "code",
      }),
    ).op,
  ).toMatchObject({ attempt: validAttempt, code: "code" });
  for (const url of [
    callback,
    "http://127.0.0.1:4318/v1/integrations/custom/oauth/callback",
    "http://localhost/v1/integrations/custom/oauth/callback",
    "http://[::1]/v1/integrations/custom/oauth/callback",
  ]) {
    expect(
      parseOpRequest(
        oauthEnvelope(
          { kind: "title", text: "title" },
          { customOAuthCallbackUrl: url },
        ),
      ).customOAuthCallbackUrl,
    ).toBe(url);
  }
  for (const callbackUrl of [
    "/relative",
    "http://remote.example/v1/integrations/custom/oauth/callback",
    "https://gateway.example/other",
    `${callback}?code=x`,
    `${callback}#x`,
    "https://u:p@gateway.example/v1/integrations/custom/oauth/callback",
    null,
    1,
  ]) {
    expect(() =>
      parseOpRequest(
        oauthEnvelope({
          kind: "custom-oauth",
          action: "start",
          slug: "acme",
          callbackUrl,
        }),
      ),
    ).toThrow();
    expect(() =>
      parseOpRequest(
        oauthEnvelope(
          { kind: "title", text: "title" },
          { customOAuthCallbackUrl: callbackUrl },
        ),
      ),
    ).toThrow();
  }
  for (const slug of ["Bad Slug", "../x", "", "x".repeat(65)]) {
    expect(() =>
      parseOpRequest(
        oauthEnvelope({
          kind: "custom-oauth",
          action: "start",
          slug,
          callbackUrl: callback,
        }),
      ),
    ).toThrow();
  }
  for (const code of ["", " ", 1, "c".repeat(8193)]) {
    expect(() =>
      parseOpRequest(
        oauthEnvelope({
          kind: "custom-oauth",
          action: "complete",
          attempt: validAttempt,
          code,
        }),
      ),
    ).toThrow();
  }
  for (const attempt of [
    null,
    [],
    { ...validAttempt, client: [] },
    { ...validAttempt, metadata: [] },
    { ...validAttempt, resource: 1 },
    { ...validAttempt, expiresAtMs: Infinity },
    { ...validAttempt, expiresAtMs: "1" },
    { ...validAttempt, client: { filler: "x".repeat(65536) } },
    ...[
      "slug",
      "endpoint",
      "codeVerifier",
      "redirectUri",
      "authorizationServerUrl",
    ].map((key) => ({ ...validAttempt, [key]: 1 })),
  ]) {
    expect(() =>
      parseOpRequest(
        oauthEnvelope({
          kind: "custom-oauth",
          action: "complete",
          attempt,
          code: "code",
        }),
      ),
    ).toThrow();
  }
});

test("the envelope's plan limits ride the op, and only valid ones", () => {
  const base = {
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
    op: {
      kind: "route",
      method: "PATCH",
      rest: "routines/r1",
      contentType: "application/json",
      body: "{}",
    },
  };
  expect(
    parseOpRequest({ ...base, limits: { routineMinIntervalMinutes: 15 } })
      .limits,
  ).toEqual({ routineMinIntervalMinutes: 15 });
  expect(parseOpRequest(base)).not.toHaveProperty("limits");
  expect(
    parseOpRequest({ ...base, limits: { routineMinIntervalMinutes: "15" } }),
  ).not.toHaveProperty("limits");
});

test("an op's credential keeps every served field the turn envelope keeps", () => {
  const base = {
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
    op: { kind: "title", text: "hello" },
  };
  const parsed = parseOpRequest({
    ...base,
    credential: {
      provider: "github-copilot",
      access: "tok",
      expires: 123,
      accountId: "acct",
      kind: "oauth",
      enterpriseUrl: "ghe.example.com",
      scope: "personal",
      subscriptionType: "max",
    },
  });
  expect(parsed.credential).toEqual({
    provider: "github-copilot",
    access: "tok",
    expires: 123,
    accountId: "acct",
    kind: "oauth",
    enterpriseUrl: "ghe.example.com",
    scope: "personal",
    subscriptionType: "max",
  });
  expect(parseOpRequest(base).credential).toBeNull();
  expect(() =>
    parseOpRequest({ ...base, credential: { provider: "openai-codex" } }),
  ).toThrow("invalid 'credential'");
});
