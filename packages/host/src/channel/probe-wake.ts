import type { ServerResponse } from "node:http";
import type { ChannelCtx, RuntimeEndpoint, RuntimeLauncher } from "../ports";
import { json } from "../routes/http";

/**
 * Idempotent, read-only status probes the client fires on mount (provider
 * picker, usage meter, connect dialog). They report what a runtime *knows*, so
 * an unanswered one costs the user nothing but a retry — unlike a turn, where
 * waiting out the cold boot IS the point. Deliberately narrow: GET only, exact
 * paths, no route that mutates or streams. `rest` is the dispatch remainder
 * (routes/agents.ts, routes/setup-runtime.ts), i.e. no leading slash.
 */
const PROBE_ROUTES = new Set(["providers", "providers/usage", "auth/status"]);

/**
 * How long a probe waits for a cold runtime before answering "ask again". Long
 * enough that an already-warm (or nearly-warm) runtime answers for real, short
 * enough that the picker never looks hung: the alternative was holding the
 * socket for the launcher's whole boot budget (60s) behind one spinner.
 */
const PROBE_WAKE_DEADLINE_MS = 1_500;

/**
 * Wake the agent's runtime for one dispatched request, and say where to reach
 * it — or null when the request has already been ANSWERED (503) and the caller
 * must stop.
 *
 * Everything but a read-only probe awaits the wake outright: a turn, an SSE
 * subscription or a login has nothing useful to say before its runtime is up.
 * A probe instead RACES the wake against a short deadline and, when the boot is
 * slower, answers 503 + `Retry-After` so the socket is freed in milliseconds
 * instead of minutes (the provider picker's spinner used to sit on exactly
 * this, for a full cold boot, on every zero-provider desktop launch).
 *
 * Two properties make that safe:
 * - The boot is NEVER aborted. `ensureAwake` keeps running in the background,
 *   so the client's retry a couple of seconds later meets a live runtime rather
 *   than paying for a fresh cold start.
 * - It cannot double-spawn. `ensureAwake` is single-flight per agent
 *   (launcher/process.ts `booting`), so the retry — and every other caller
 *   arriving meanwhile — joins the SAME spawn.
 *
 * The launcher's own `status` is deliberately not consulted: mid-boot it
 * already reports "running" (the live-set entry exists before the child is
 * healthy), which is exactly the case this guards. A warm runtime costs nothing
 * here — `ensureAwake` resolves at once and wins the race.
 */
export async function wakeForDispatch(
  launcher: RuntimeLauncher,
  ctx: ChannelCtx,
  method: string,
  rest: string,
  res: ServerResponse,
): Promise<RuntimeEndpoint | null> {
  const wake = launcher.ensureAwake(ctx.agent);
  if (method !== "GET" || !PROBE_ROUTES.has(rest)) return wake;

  // A boot that fails after this request has been answered has no one left to
  // tell; the next probe re-triggers the spawn and surfaces the failure then.
  // (A failure BEFORE the deadline still rejects out of the race below.)
  wake.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooSlow = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROBE_WAKE_DEADLINE_MS);
    timer.unref?.();
  });
  try {
    const endpoint = await Promise.race([wake, tooSlow]);
    if (endpoint) return endpoint;
  } finally {
    clearTimeout(timer);
  }
  json(
    res,
    503,
    { error: "the agent's runtime is still starting, try again shortly" },
    { "Retry-After": "2" },
  );
  return null;
}
