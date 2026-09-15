import type { ServerResponse } from "node:http";
import { findVisibleOperation } from "../assistant/catalog";
import { confirmationSummary } from "../assistant/summary";
import { approved } from "./assistant-approval-gate";
import { assistantDeploymentRoute } from "./assistant-deployment-route";
import { dispatchAssistantOperation } from "./assistant-dispatch";
import { forwardAssistantCall } from "./assistant-forward";
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

/**
 * The two decisions `/sandbox/assistant/*` makes once the caller is known to be
 * the assistant: raise an approval card's request, and perform an operation.
 *
 * The confirmation lock lives HERE rather than in the runtime because the host
 * is the process that holds the credential. A runtime that skipped its own gate
 * (a bug, a fork, a prompt-injected agent addressing the route directly with the
 * sandbox token it already carries) still cannot perform a `confirm: true`
 * operation: without a receipt the user themselves minted, this refuses.
 */

/**
 * `POST /sandbox/assistant/pending` — raise ONE approval card's request.
 *
 * Returns the id the card carries and the sentence the card shows, both minted
 * here so the wording the person reads and the bytes their yes authorizes are
 * decided in the same place and cannot drift apart.
 */
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
  // After findVisibleOperation: a hidden op must read as nonexistent, not unserved.
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
  // Validate the arguments the SAME way performing them would, so a card can
  // never describe a call that would be refused the moment it is approved.
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

/**
 * `POST /sandbox/assistant/call` — perform one catalogued operation.
 *
 * A `confirm: true` operation is performed ONLY against an approved, unspent,
 * unexpired receipt whose key matches the arguments SUBMITTED here, in the
 * conversation and for the agent it was raised in. Every other case answers
 * `approval_required`, which the runtime tool renders as a fresh ask.
 */
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
  // After findVisibleOperation: a hidden op must read as nonexistent, not unserved.
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
  // The receipt is keyed by the RESOLVED arguments, which is what the card was
  // issued for: the user approved an operation on one agent, not on a spelling.
  if (op.confirm && !approved(ctx, input, params, res)) return;
  const request = assistantDeploymentRoute(dispatch.request, ctx);
  if (!request) {
    json(res, 400, {
      error: "this host cannot address that operation",
      code: "gateway_address",
    });
    return;
  }

  await forwardAssistantCall(
    input.gateway,
    request,
    {
      operation: input.operation,
      actingAs: input.actingAs,
      fetchImpl: input.fetchImpl,
    },
    res,
  );
}
