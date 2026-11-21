import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BROWSER_LIVE_HANDOFF,
  BROWSER_LIVE_MAX_BODY_BYTES,
  BROWSER_LIVE_VIEWER,
  type BrowserLiveEvent,
  type BrowserLiveInputAnswer,
  type BrowserLiveRefusal,
  parseBrowserLiveInputRequest,
} from "@houston/wire-types";
import {
  type HandoffRegistry,
  sharedHandoffs,
} from "../session/tools/browser/live/registry";
import type { HandoffSession } from "../session/tools/browser/live/session";
import { json } from "./http-helpers";
import { cardActor } from "./interaction-owner-gate";

const HEARTBEAT_MS = 15_000;

function refuse(
  res: ServerResponse,
  status: number,
  code: BrowserLiveRefusal,
  session?: HandoffSession,
): void {
  json(res, status, {
    error: code,
    code,
    ...(session ? { state: session.state } : {}),
  });
}

function sessionFor(
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
  registry: HandoffRegistry,
  handoff: string | undefined,
): HandoffSession | undefined {
  const latest = registry.get(conversationId);
  const session =
    handoff === undefined ? latest : registry.find(conversationId, handoff);
  if (!session) {
    if (latest) refuse(res, 409, "handoff_ended");
    else refuse(res, 404, "no_handoff");
    return undefined;
  }
  if (cardActor(req.headers) !== session.owner) {
    refuse(res, 403, "not_handoff_owner");
    return undefined;
  }
  return session;
}

export function serveBrowserLive(
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
  url: URL,
  registry: HandoffRegistry = sharedHandoffs,
): void {
  const viewer = url.searchParams.get("viewer") ?? "";
  const layout = url.searchParams.get("layout") ?? "desktop";
  const handoff = url.searchParams.get("handoff") ?? undefined;
  if (
    !BROWSER_LIVE_VIEWER.test(viewer) ||
    (layout !== "desktop" && layout !== "phone") ||
    (handoff !== undefined && !BROWSER_LIVE_HANDOFF.test(handoff))
  ) {
    refuse(res, 400, "invalid_input");
    return;
  }
  const session = sessionFor(req, res, conversationId, registry, handoff);
  if (!session) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.socket?.setNoDelay?.(true);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": hb\n\n");
  }, HEARTBEAT_MS);
  const write = (event: BrowserLiveEvent): boolean => {
    if (res.writableEnded) return false;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (event.type === "status" && event.state !== "waiting") res.end();
    return true;
  };
  const detach = session.attachViewer(viewer, layout, write);
  res.on("close", () => {
    clearInterval(heartbeat);
    detach();
  });
  if (res.writableEnded) clearInterval(heartbeat);
}

class BodyTooLarge extends Error {}

async function readCapped(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).byteLength;
    if (size > BROWSER_LIVE_MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function serveBrowserInput(
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
  registry: HandoffRegistry = sharedHandoffs,
): Promise<void> {
  let request: ReturnType<typeof parseBrowserLiveInputRequest>;
  try {
    request = parseBrowserLiveInputRequest(JSON.parse(await readCapped(req)));
  } catch {
    refuse(res, 400, "invalid_input");
    return;
  }
  const session = sessionFor(
    req,
    res,
    conversationId,
    registry,
    request.handoff,
  );
  if (!session) return;
  if (session.state !== "waiting") {
    refuse(res, 409, "handoff_ended", session);
    return;
  }
  if (request.ack) session.ack(request.ack.viewer, request.ack.seq);
  const outcome = request.events?.length
    ? await session.apply(request.events, request.batch)
    : {};
  if (request.finish)
    session.finish(request.finish === "done" ? "done" : "cancelled");
  const answer: BrowserLiveInputAnswer = { state: session.state, ...outcome };
  json(res, 200, answer);
}
