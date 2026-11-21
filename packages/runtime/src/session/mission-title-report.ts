import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import { config } from "../config";
import { type ActingContext, runWithActingContext } from "./acting-context";
import {
  generateMissionTitle,
  type MissionTitleRequest,
  type MissionTitleRunner,
} from "./mission-title";
import { titleWithTurnModel } from "./summarize";

const REQUEST_TIMEOUT_MS = 5_000;
const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

export interface MissionTitleReportOptions {
  run?: MissionTitleRunner;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  timeoutMs?: number;
}

export async function titleMissionAfterTurn(
  conversationId: string,
  request: MissionTitleRequest,
  model: { provider: string; id: string },
  acting: ActingContext | undefined,
  opts: MissionTitleReportOptions = {},
): Promise<void> {
  const run =
    opts.run ??
    ((excerpt: string, signal: AbortSignal) =>
      runWithActingContext(acting, () =>
        titleWithTurnModel(excerpt, model, signal),
      ));
  const title = await generateMissionTitle(
    conversationId,
    request,
    run,
    opts.timeoutMs,
  );
  if (!title) return;
  if (!config.controlPlaneUrl || !config.sandboxToken) {
    console.warn(
      `[mission-title] no host to write the title to for ${conversationId}`,
    );
    return;
  }
  const base = config.controlPlaneUrl.replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const response = await fetchWithRetry(
      (url, init) =>
        fetchImpl(url, {
          ...init,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
      `${base}/sandbox/missions/title`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.sandboxToken}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          title,
          fallback: request.fallback,
        }),
      },
      opts.retryDelaysMs ? { delaysMs: opts.retryDelaysMs } : {},
    );
    await response.body?.cancel();
    if (UNREACHABLE_STATUSES.has(response.status))
      console.warn(
        `[mission-title] host unreachable for ${conversationId} (HTTP ${response.status}); keeping the fallback`,
      );
    else if (!response.ok)
      console.error(
        `[mission-title] host refused the title for ${conversationId}: HTTP ${response.status}`,
      );
  } catch (err) {
    console.warn(
      `[mission-title] title write failed for ${conversationId}; keeping the fallback:`,
      err,
    );
  }
}
