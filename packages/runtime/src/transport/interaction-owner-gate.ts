import type { IncomingHttpHeaders } from "node:http";
import { ROUTINE_FIRE_HEADER } from "@houston/protocol";
import { actingFromHeaders } from "../session/acting-context";
import { decodeActingAuthor } from "../session/attribution";
import type { CardAnswer } from "../session/turn-start-failure";
import { storedCardRefuses } from "../store/conversation-card";
import { notInteractionOwnerBody } from "../store/interaction-owner";
import { json, type RouteContext } from "./http-helpers";

export function cardActor(headers: IncomingHttpHeaders): string | undefined {
  return decodeActingAuthor(actingFromHeaders(headers)?.actingAs)?.userId;
}

export function refuseNonCardOwner(ctx: RouteContext, id: string): boolean {
  if (!storedCardRefuses(id, cardActor(ctx.req.headers))) return false;
  json(ctx.res, 403, notInteractionOwnerBody);
  return true;
}

export function isRoutineFire(headers: IncomingHttpHeaders): boolean {
  return headers[ROUTINE_FIRE_HEADER] === "1";
}

export function sendAnswerer(headers: IncomingHttpHeaders): string | undefined {
  return isRoutineFire(headers) ? undefined : cardActor(headers);
}

export function queuedCardAnswer(
  userId: string | undefined,
  onRefused: () => void,
): { cardAnswer?: CardAnswer } {
  return userId ? { cardAnswer: { userId, onRefused } } : {};
}
