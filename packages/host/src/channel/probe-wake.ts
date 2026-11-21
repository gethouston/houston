import type { ServerResponse } from "node:http";
import {
  type ChannelCtx,
  LauncherClosedError,
  type RuntimeEndpoint,
  type RuntimeLauncher,
} from "../ports";
import { json } from "../routes/http";

const PROBE_ROUTES = new Set(["providers", "providers/usage", "auth/status"]);

const PROBE_WAKE_DEADLINE_MS = 1_500;

export async function wakeForDispatch(
  launcher: RuntimeLauncher,
  ctx: ChannelCtx,
  method: string,
  rest: string,
  res: ServerResponse,
): Promise<RuntimeEndpoint | null> {
  const wake = launcher.ensureAwake(ctx.agent);
  if (method !== "GET" || !PROBE_ROUTES.has(rest))
    return wake.catch((err) => rejectIfClosed(err, res));

  wake.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooSlow = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROBE_WAKE_DEADLINE_MS);
    timer.unref?.();
  });
  try {
    const endpoint = await Promise.race([wake, tooSlow]);
    if (endpoint) return endpoint;
  } catch (err) {
    return rejectIfClosed(err, res);
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

function rejectIfClosed(err: unknown, res: ServerResponse): null {
  if (!(err instanceof LauncherClosedError)) throw err;
  json(
    res,
    503,
    { error: "engine unavailable", detail: err.message },
    { "Retry-After": "2" },
  );
  return null;
}
