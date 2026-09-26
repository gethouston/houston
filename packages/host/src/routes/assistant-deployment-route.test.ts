import type { ServerResponse } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import { ApprovalStore } from "../assistant/approvals";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { assistantDeploymentRoute } from "./assistant-deployment-route";
import type { AssistantUpstreamRequest } from "./assistant-dispatch";
import { handleAssistantCall } from "./assistant-operate";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { liveTurns } from "./live-turn";

const agentId = "workspace/manager-routing";
const conversationId = "conversation-routing";
afterEach(() => liveTurns.forget(agentId));

function context(gatewayFronted = true): AssistantOperationCtx {
  const catalog = processAssistantCatalog();
  if (!catalog) throw new Error("missing embedded catalog");
  const empty = async () => [];
  return {
    catalog,
    approvals: new ApprovalStore(),
    agentId,
    conversationId,
    gatewayFronted,
    unserved: new Set<string>(),
    gatewayAgentId: "trusted-pod",
    agents: empty,
    directory: {
      agents: empty,
      workspaces: empty,
      members: empty,
      invites: empty,
      routines: empty,
      skills: empty,
      sharedSkills: empty,
      activities: empty,
    },
  };
}

async function call(
  ctx: AssistantOperationCtx,
  operation: string,
  params: Record<string, unknown> = {},
  requestId?: string,
) {
  const result = { status: 0, body: "" };
  const res = {
    writeHead(status: number) {
      result.status = status;
    },
    end(body: string) {
      result.body = body;
    },
  } as unknown as ServerResponse;
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{"items":[{"slug":"custom-app"}]}'));
  await handleAssistantCall(
    ctx,
    {
      operation,
      params,
      requestId,
      actingAs: "verified-user",
      gateway: { url: "https://gateway.test", token: "assistant-token" },
      fetchImpl,
    },
    res,
  );
  return { ...result, fetchImpl };
}

test.each([
  true,
  false,
])("custom list routes correctly, managed=%s", async (managed) => {
  const result = await call(context(managed), "customIntegrations");
  expect(result.status).toBe(200);
  expect(result.body).toBe('{"items":[{"slug":"custom-app"}]}');
  expect(result.fetchImpl.mock.calls[0]?.[0]).toBe(
    managed
      ? "https://gateway.test/agents/trusted-pod/integrations/custom/definitions"
      : "https://gateway.test/v1/integrations/custom/definitions",
  );
});

test("custom writes retain live-turn and approval gates, then preserve approved body", async () => {
  const ctx = context();
  const params = { url: "https://service.test/schema?version=2" };
  expect(
    (await call(ctx, "detectCustomIntegration", params)).fetchImpl,
  ).not.toHaveBeenCalled();
  liveTurns.start(agentId, conversationId, "execute");
  const refused = await call(ctx, "detectCustomIntegration", params);
  expect(JSON.parse(refused.body).code).toBe("approval_required");
  expect(refused.fetchImpl).not.toHaveBeenCalled();
  const issued = ctx.approvals.issue({
    operation: "detectCustomIntegration",
    params,
    agentId,
    conversationId,
    summary: "Detect service",
  });
  ctx.approvals.decide({
    requestId: issued.requestId,
    agentId,
    conversationId,
    decision: "approve",
  });
  const result = await call(
    ctx,
    "detectCustomIntegration",
    params,
    issued.requestId,
  );
  expect(result.status).toBe(200);
  expect(result.fetchImpl.mock.calls[0]?.[0]).toBe(
    "https://gateway.test/agents/trusted-pod/integrations/custom/detect",
  );
  expect(result.fetchImpl.mock.calls[0]?.[1]?.body).toBe(
    JSON.stringify(params),
  );
});

test.each([
  "submitCustomIntegrationCredential",
  "startCustomIntegrationOAuth",
])("hidden %s stays refused", async (operation) => {
  const result = await call(context(), operation, {
    slug: "custom-app",
    values: { token: "secret" },
  });
  expect(JSON.parse(result.body).code).toBe("operation_not_supported");
  expect(result.fetchImpl).not.toHaveBeenCalled();
});

test.each([
  undefined,
  "",
  "..",
  "a/b",
  "a\\b",
  "%252e%252e",
  "a%252fb",
  "a\u0000b",
])("invalid trusted pod target %s fails closed", async (gatewayAgentId) => {
  const result = await call(
    { ...context(), gatewayAgentId },
    "customIntegrations",
  );
  expect(JSON.parse(result.body).code).toBe("gateway_address");
  expect(result.fetchImpl).not.toHaveBeenCalled();
});

test("every visible catalogued custom-integration route is rewritten", () => {
  const catalog = processAssistantCatalog();
  if (!catalog) throw new Error("missing embedded catalog");
  const prefix = "/v1/integrations/custom/";
  const custom = catalog.operations.filter(
    (op) => op.route?.path.startsWith(prefix) && !op.hidden,
  );
  expect(custom.length).toBeGreaterThan(0);
  for (const op of custom) {
    const route = op.route;
    if (!route) throw new Error(`${op.name} lost its route`);
    const request: AssistantUpstreamRequest = {
      // The catalog carries `{param}` placeholders; the dispatcher substitutes
      // them before this route ever sees a path.
      path: route.path.replace(/\{[^}]+\}/g, "custom-app"),
      method: route.method,
      query: {},
    };
    const rewritten = assistantDeploymentRoute(request, {
      gatewayFronted: true,
      gatewayAgentId: "trusted-pod",
    });
    // The hand-listed shapes in assistantDeploymentRoute must keep covering the
    // GENERATED catalog: a newly catalogued operation the list never learned
    // about 400s on every gateway-fronted deployment and nowhere else. Hidden
    // operations are exempt — the secret-bearing credential/oauth pair is
    // refused before dispatch (see "hidden %s stays refused" above), so
    // whether a route exists for them decides nothing.
    //
    // Pinned to the exact upstream request, not merely non-null: a rewrite that
    // lands on the wrong pod path (or drops the method/query) reaches a real
    // gateway and fails there, which a null-check can never catch.
    expect(
      rewritten,
      `${op.name} (${route.method} ${route.path}) is not routed for a gateway-fronted deployment`,
    ).toEqual({
      ...request,
      path: `/agents/trusted-pod/integrations/custom/${request.path.slice(prefix.length)}`,
    });
  }
});

test("route mapping escapes trusted target and preserves method, query and body", () => {
  const request: AssistantUpstreamRequest = {
    path: "/v1/integrations/custom/definitions",
    method: "POST",
    body: { name: "custom-app" },
    query: { value: "a/b" },
  };
  expect(
    assistantDeploymentRoute(request, {
      gatewayFronted: true,
      gatewayAgentId: "pod ?#",
    }),
  ).toEqual({
    ...request,
    path: "/agents/pod%20%3F%23/integrations/custom/definitions",
  });
  expect(assistantDeploymentRoute(request, {})).toBe(request);
  expect(
    assistantDeploymentRoute(
      {
        ...request,
        path: "/v1/integrations/custom/definitions/app/credential",
      },
      context(),
    ),
  ).toBeNull();
});

// The allowlist pairs a SHAPE with its methods, so a method the pod never
// serves on that shape must be declined rather than forwarded: a rewrite that
// looked only at the path would send these to the agent's engine, where they
// land on no handler at all.
test.each([
  "/v1/integrations/custom/definitions/app/credential",
  "/v1/integrations/custom/definitions/app/detect",
])("PATCH %s is declined", (path) => {
  expect(
    assistantDeploymentRoute(
      { path, method: "PATCH", query: {} },
      { gatewayFronted: true, gatewayAgentId: "trusted-pod" },
    ),
  ).toBeNull();
});
