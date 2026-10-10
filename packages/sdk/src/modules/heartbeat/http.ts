/**
 * The heartbeat REST calls, over the injected `fetch`: the open host's
 * `/v1/heartbeat` family (desktop, self-host). Literal paths through
 * {@link httpRequest}, which is what keeps them visible to the assistant's
 * catalog.
 *
 * Nothing here degrades: a non-2xx throws a `HeartbeatHttpError` carrying the
 * status, and {@link classifyHeartbeatFailure} (`types.ts`) names it.
 */

import { type HttpScope, httpRequest } from "../http";
import type {
  HeartbeatRunResult,
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "./types";

/**
 * Shows the morning briefing settings: whether the AI Manager sends one, from
 * what time, and how the last one went.
 *
 * Every morning the manager looks across the person's AI Employees and writes
 * a short briefing into its chat: what needs their attention first, then what
 * got done. `time` is `HH:MM` in the person's own timezone. `last` is the most
 * recent run (`delivered`, `quiet` when nothing needed saying, or `error`), or
 * nothing before the first one.
 * @assistant group:settings
 */
export async function getHeartbeat(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<HeartbeatState> {
  const res = await httpRequest(scope, "/v1/heartbeat", { signal });
  return (await res.json()) as HeartbeatState;
}

/**
 * Turns the morning briefing on or off, or changes the time it arrives.
 *
 * Either field alone is fine: `{ "time": "07:00" }` moves it to 7 in the
 * morning, `{ "enabled": false }` stops it. Times are `HH:MM`, 24-hour, in the
 * person's own timezone. Answers the settings as saved.
 * @param patch What to change: `enabled` (on or off) and/or `time` (`HH:MM`).
 * @assistant group:settings unconfirmed: A reversible personal preference the settings screen changes with one click.
 */
export async function setHeartbeat(
  scope: HttpScope,
  patch: HeartbeatSettingsPatch,
  signal?: AbortSignal,
): Promise<HeartbeatState> {
  const res = await httpRequest(scope, "/v1/heartbeat", {
    method: "PUT",
    body: JSON.stringify(patch),
    signal,
  });
  return (await res.json()) as HeartbeatState;
}

/**
 * Sends the morning briefing right now, whatever the time.
 *
 * Answers `delivered` when a briefing turn started on the AI Manager, or
 * `quiet` when nothing needed the person's attention (no message is written).
 * Refused while the manager is already answering something.
 * @assistant group:settings
 * @assistant hidden: the briefing is a turn on the AI Manager itself, and it never starts while the manager is mid-turn, so a call from inside the manager's own turn is always refused (turn_running).
 */
export async function runHeartbeatNow(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<HeartbeatRunResult> {
  const res = await httpRequest(scope, "/v1/heartbeat/run", {
    method: "POST",
    body: JSON.stringify({}),
    signal,
  });
  return (await res.json()) as HeartbeatRunResult;
}
