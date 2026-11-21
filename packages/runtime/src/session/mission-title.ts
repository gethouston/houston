export {
  type MissionTitleRequest,
  parseMissionTitle,
} from "@houston/protocol";

import type { MissionTitleRequest } from "@houston/protocol";

export type MissionTitleRunner = (
  excerpt: string,
  signal: AbortSignal,
) => Promise<string>;

export const MISSION_TITLE_TIMEOUT_MS = 10_000;

const EXCERPT_MAX = 2400;

export function cleanMissionTitle(value: string | undefined): string | null {
  if (!value) return null;
  const firstLine = value.trim().split("\n")[0] ?? "";
  const normalized = firstLine
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();
  if (!normalized) return null;
  const words = normalized.split(" ").slice(0, 6).join(" ");
  return [...words].slice(0, 64).join("");
}

class MissionTitleTimeout extends Error {}
class MissionTitleCancelled extends Error {}

export type MissionTitleMiss = "timeout" | "error" | "no_title" | "cancelled";

export type MissionTitleResult = { title: string } | { miss: MissionTitleMiss };

export async function generateMissionTitle(
  conversationId: string,
  request: MissionTitleRequest,
  run: MissionTitleRunner,
  timeoutMs = MISSION_TITLE_TIMEOUT_MS,
): Promise<string | null> {
  const result = await runMissionTitle(conversationId, request, run, timeoutMs);
  return "title" in result ? result.title : null;
}

export interface MissionTitleControl {
  cancel?: AbortSignal;
  capStart?: Promise<void>;
}

export async function runMissionTitle(
  conversationId: string,
  request: MissionTitleRequest,
  run: MissionTitleRunner,
  timeoutMs = MISSION_TITLE_TIMEOUT_MS,
  { cancel, capStart }: MissionTitleControl = {},
): Promise<MissionTitleResult> {
  const excerpt = request.text.trim().slice(0, EXCERPT_MAX);
  if (!excerpt) return { miss: "no_title" };
  if (cancel?.aborted) return { miss: "cancelled" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  let onCancel: (() => void) | undefined;
  const abort = new AbortController();
  try {
    const raw = await Promise.race([
      run(excerpt, abort.signal),
      new Promise<never>((_, reject) => {
        const arm = () => {
          if (done) return;
          timer = setTimeout(
            () => reject(new MissionTitleTimeout()),
            timeoutMs,
          );
        };
        if (capStart) void capStart.then(arm);
        else arm();
        onCancel = () => {
          abort.abort();
          reject(new MissionTitleCancelled());
        };
        cancel?.addEventListener("abort", onCancel, { once: true });
      }),
    ]);
    const title = cleanMissionTitle(raw);
    return title && title !== request.fallback
      ? { title }
      : { miss: "no_title" };
  } catch (err) {
    if (err instanceof MissionTitleCancelled || cancel?.aborted)
      return { miss: "cancelled" };
    if (err instanceof MissionTitleTimeout) {
      abort.abort();
      console.warn(
        `[mission-title] no title within ${timeoutMs} ms for ${conversationId}; keeping the fallback`,
      );
      return { miss: "timeout" };
    }
    console.error(
      `[mission-title] title failed for ${conversationId}; keeping the fallback:`,
      err instanceof Error ? err.message : String(err),
    );
    return { miss: "error" };
  } finally {
    done = true;
    if (timer) clearTimeout(timer);
    if (onCancel) cancel?.removeEventListener("abort", onCancel);
  }
}
