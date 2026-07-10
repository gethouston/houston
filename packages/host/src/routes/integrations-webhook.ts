import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, Workspace, WorkspaceRuntime } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import { fireTriggerEvents, type TriggerEventLock } from "../triggers/fire";
import { truncateEventPayload } from "../triggers/payload";
import type { TriggerStateStore } from "../triggers/state-store";
import { verifyComposioWebhook } from "../triggers/webhook-verify";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { header, json } from "./http";
import { readBody } from "./read-body";

export interface ComposioWebhookDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  events?: EventHub;
  /** The reconciler's state store — resolves a Composio instance id → its routine. */
  triggerState?: TriggerStateStore;
  triggerLock?: TriggerEventLock;
  /** COMPOSIO_WEBHOOK_SECRET; absent → the route is not mounted (returns false). */
  composioWebhookSecret?: string;
  nowMs?: () => number;
}

const WEBHOOK_PATH = "/v1/integrations/composio/webhook";

/**
 * Caps a single webhook body at 1 MiB, matching the cloud edge twin
 * (cloud/internal/edge/integrations/webhook.go `maxWebhookBodyBytes`). Composio
 * events are small notifications; a body over this is rejected outright. Tighter
 * than the generic JSON cap because this route is unauthenticated and
 * internet-facing — the HMAC signature is the only trust boundary.
 */
const MAX_WEBHOOK_BODY_BYTES = 1 << 20; // 1 MiB

/** Find which agent/routine owns a Composio trigger instance id (self-host scan). */
async function resolveInstance(
  deps: ComposioWebhookDeps,
  state: TriggerStateStore,
  triggerInstanceId: string,
): Promise<{ ws: Workspace; agent: Agent; routineId: string } | null> {
  for (const ws of await deps.store.listWorkspaces()) {
    for (const agent of await deps.store.listAgents(ws.id)) {
      const entries = await state.get(agent.id);
      for (const [routineId, entry] of Object.entries(entries)) {
        if (entry.trigger_instance_id === triggerInstanceId) {
          return { ws, agent, routineId };
        }
      }
    }
  }
  return null;
}

/**
 * POST /v1/integrations/composio/webhook (contract C9 #3) — the self-host ingress
 * for external events. NO user auth: the raw-body HMAC signature is the ONLY
 * trust boundary, so it is verified (constant-time, 300s window) BEFORE anything
 * else. A verified-but-unknown/stale instance id → 200 drop (Composio must not
 * retry). A verified event fires through the SAME batch path as the pod route
 * (fireTriggerEvents), so there is one firing code path, not two. A `busy`
 * routine → 503 (NOT 200): self-host has no pending-events queue, so the event
 * must not be acked as delivered — Composio redelivers and the released dedup
 * locks let it fire once the in-flight run completes.
 *
 * Mounted only when `composioWebhookSecret` is set (self-host with triggers on);
 * otherwise returns false so the request falls through (→ 401/404), exactly as if
 * the route did not exist. Returns true when it handled the request.
 */
export async function handleComposioWebhook(
  deps: ComposioWebhookDeps,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== WEBHOOK_PATH || method !== "POST") return false;
  if (!deps.composioWebhookSecret) return false;

  // Enforce the byte ceiling BEFORE touching the signature: this is the DoS
  // guard for an unauthenticated public endpoint, so it must gate the request
  // ahead of any HMAC work (mirrors the cloud edge twin's 413). `readBody` caps
  // WHILE streaming (never buffers an oversized body whole) and throws
  // BodyTooLargeError, which the server's top-level handler maps to a clean 413
  // with `Connection: close` — the shared OOM guard, not a bespoke reader.
  const rawBody = (await readBody(req, MAX_WEBHOOK_BODY_BYTES)).toString(
    "utf8",
  );
  const verified = verifyComposioWebhook({
    id: header(req, "webhook-id") ?? "",
    timestamp: header(req, "webhook-timestamp") ?? "",
    signature: header(req, "webhook-signature") ?? "",
    rawBody,
    secret: deps.composioWebhookSecret,
    nowMs: deps.nowMs?.(),
  });
  if (!verified.ok) {
    json(res, 401, { error: verified.reason });
    return true;
  }

  if (!deps.triggerState || !deps.triggerLock || !deps.vfs) {
    json(res, 503, { error: "trigger ingress not configured" });
    return true;
  }

  let body: {
    id?: unknown;
    metadata?: { trigger_id?: unknown; trigger_slug?: unknown };
    data?: unknown;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    json(res, 400, { error: "webhook body is not valid JSON" });
    return true;
  }
  const eventId = body.id;
  const triggerInstanceId = body.metadata?.trigger_id;
  const triggerSlug = body.metadata?.trigger_slug;
  if (typeof eventId !== "string" || typeof triggerInstanceId !== "string") {
    json(res, 400, { error: "webhook missing id / metadata.trigger_id" });
    return true;
  }

  // Verified but unknown/stale instance: silently drop with 200 so Composio does
  // not retry a delivery no routine will ever consume.
  const owner = await resolveInstance(
    deps,
    deps.triggerState,
    triggerInstanceId,
  );
  if (!owner) {
    json(res, 200, { result: "dropped" });
    return true;
  }

  const result = await fireTriggerEvents(
    {
      vfs: deps.vfs,
      paths: deps.paths ?? DEFAULT_PATHS,
      channels: deps.channels,
      events: deps.events,
      lock: deps.triggerLock,
    },
    owner.ws,
    owner.agent,
    [
      {
        id: eventId,
        routine_id: owner.routineId,
        trigger_slug: typeof triggerSlug === "string" ? triggerSlug : "",
        payload: truncateEventPayload(body.data),
      },
    ],
  );
  // `busy` means the routine's previous run is still in flight, and on this path
  // fireTriggerEvents already RELEASED the batch's fresh dedup locks (fire.ts) so
  // a redelivery can re-fire. Unlike the cloud path there is NO pending-events
  // queue here to hold the event and retry it internally, so acking 200 would let
  // Composio treat the event as delivered and never redeliver it — the event is
  // lost. Answer non-2xx (with a Retry-After hint) so Composio retries; the
  // released locks let the redelivery fire once the routine frees up. This is the
  // storm-control path for a busy inbox — a common case, not an edge one.
  if (result.result === "busy") {
    res.setHeader("retry-after", "30");
    json(res, 503, result);
    return true;
  }
  json(res, 200, result);
  return true;
}
