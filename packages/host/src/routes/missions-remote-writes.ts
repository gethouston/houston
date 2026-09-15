import type { IncomingMessage, ServerResponse } from "node:http";
import { json, readJson } from "./http";
import { applyMissionStatus } from "./missions-manage";
import {
  parseMissionOrigin,
  parseMissionStart,
  parseMissionStatus,
} from "./missions-remote";
import type { MissionsCtx } from "./missions-sandbox";
import { startMission } from "./missions-start-run";

/**
 * The two WRITE halves of the per-agent mission family
 * (missions-remote-inbound.ts): start a mission on this agent's board, and
 * move one already on it. Both are held to exactly the rules a local write
 * obeys — the guards live in the shared mission modules — and both refuse a
 * body that names an agent, because this surface serves the agent in its
 * address and a second hop would let one call fan out.
 */

/**
 * The move half: the same body a local move takes, applied to the agent in the
 * path. The guards live in {@link applyMissionStatus}, so a cross-pod move is
 * held to the identical rules as a local one — except the "never the mission
 * this conversation IS" one, which cannot fire here because the calling chat
 * lives in another pod entirely.
 */
export async function statusInbound(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  // As with a start: this route serves the agent in its address, and a second
  // hop would let one move fan out.
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStatus(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  await applyMissionStatus(ctx, parsed.value, res);
}

/** The start half: the same payload a local start parses, plus its origin. */
export async function startInbound(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  // A caller naming a DIFFERENT agent has the wrong address: this route serves
  // the agent in its path, and a second hop would let one call fan out.
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStart(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  const origin = parseMissionOrigin(body);
  if (!origin.ok)
    return json(res, origin.code === "mission_depth" ? 409 : 400, {
      error: origin.error,
      code: origin.code,
    });
  // The origin travels whole: the target records WHO asked and at what depth,
  // which is the only trace of either once the parent's pod is out of reach.
  await startMission(ctx, parsed.value, origin.value, res);
}
