import type { ServerResponse } from "node:http";
import { findVisibleOperation } from "../assistant/catalog";
import { grantCovers } from "../assistant/grant-shape";
import { confirmationSummary } from "../assistant/summary";
import { approved, persisted } from "./assistant-approval-gate";
import { assistantDeploymentRoute } from "./assistant-deployment-route";
import { dispatchAssistantOperation } from "./assistant-dispatch";
import { forwardAssistantCall } from "./assistant-forward";
import { refusedForAnotherActor, settleGrant } from "./assistant-grant-gate";
import type {
  AssistantCallInput,
  AssistantOperationCtx,
} from "./assistant-operation-ctx";
import {
  refusedOutsideExecute,
  refusedUnknownParams,
  refusedUnserved,
} from "./assistant-operation-guards";
import { resolvedParams } from "./assistant-operation-params";
import { refusedProtectedChat } from "./assistant-protected-chat";
import { json } from "./http";
import { liveTurns } from "./live-turn";

export async function handleAssistantPending(
  ctx: AssistantOperationCtx,
  operation: string,
  rawParams: Record<string, unknown>,
  res: ServerResponse,
): Promise<void> {
  const op = findVisibleOperation(ctx.catalog, operation);
  if (!op?.route) {
    json(res, 400, {
      error: `this host does not perform "${operation}"`,
      code: "operation_not_supported",
    });
    return;
  }
  if (refusedUnserved(ctx, op.name, res)) return;
  if (!op.confirm) {
    json(res, 400, {
      error: `"${operation}" needs no approval: call it directly`,
      code: "not_confirmable",
    });
    return;
  }
  if (refusedOutsideExecute(ctx, op, res)) return;
  if (refusedUnknownParams(op, rawParams, res)) return;
  const params = await resolvedParams(ctx, op, rawParams, res);
  if (!params) return;
  if (await refusedProtectedChat(ctx, op, params, res)) return;
  const dispatch = dispatchAssistantOperation(ctx.catalog, operation, params);
  if (!dispatch.ok) {
    json(res, 400, { error: dispatch.message, code: dispatch.code });
    return;
  }
  if (!ctx.conversationId) {
    json(res, 400, {
      error: "an approval needs a conversation for the answer to arrive in",
      code: "missing_conversation",
    });
    return;
  }
  const grant = grantCovers(operation, params)
    ? ctx.approvals.grants.spend({
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
        operation,
        actor: liveTurns.get(ctx.agentId, ctx.conversationId)?.actingAs,
      })
    : undefined;
  if (grant) {
    const request = ctx.approvals.issue({
      operation,
      params,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      summary: "",
    });
    ctx.approvals.decide({
      requestId: request.requestId,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      decision: "approve",
    });
    ctx.approvals.grants.hold(request.requestId, grant);
    json(res, 200, { preApproved: true, requestId: request.requestId });
    return;
  }
  const summary = confirmationSummary(op, params);
  const request = ctx.approvals.issue({
    operation,
    params,
    agentId: ctx.agentId,
    conversationId: ctx.conversationId,
    summary: summary.title,
    ...(summary.detail ? { detail: summary.detail } : {}),
  });
  json(res, 200, {
    requestId: request.requestId,
    summary: request.summary,
    ...(request.detail ? { detail: request.detail } : {}),
    expiresAt: request.expiresAt,
  });
}

export async function handleAssistantCall(
  ctx: AssistantOperationCtx,
  input: AssistantCallInput,
  res: ServerResponse,
): Promise<void> {
  const op = findVisibleOperation(ctx.catalog, input.operation);
  if (!op?.route) {
    json(res, 400, {
      error: `this host does not perform "${input.operation}"`,
      code: "operation_not_supported",
    });
    return;
  }
  if (refusedUnserved(ctx, op.name, res)) return;
  if (refusedOutsideExecute(ctx, op, res)) return;
  if (refusedUnknownParams(op, input.params, res)) return;
  const params = await resolvedParams(ctx, op, input.params, res);
  if (!params) return;
  if (await refusedProtectedChat(ctx, op, params, res)) return;
  const dispatch = dispatchAssistantOperation(
    ctx.catalog,
    input.operation,
    params,
  );
  if (!dispatch.ok) {
    json(res, 400, { error: dispatch.message, code: dispatch.code });
    return;
  }
  if (refusedForAnotherActor(ctx, input, res)) return;
  if (op.confirm && !approved(ctx, input, params, res)) return;
  if (op.confirm && !(await persisted(ctx, res))) return;
  const request = assistantDeploymentRoute(dispatch.request, ctx);
  if (!request) {
    json(res, 400, {
      error: "this host cannot address that operation",
      code: "gateway_address",
    });
    return;
  }

  const outcome = await forwardAssistantCall(
    input.gateway,
    request,
    {
      operation: input.operation,
      actingAs: input.actingAs,
      fetchImpl: input.fetchImpl,
    },
    res,
  );
  if (op.confirm) settleGrant(ctx, input, outcome);
}
