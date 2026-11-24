import type { Capabilities, MissionTitle } from "@houston/wire-types";

/** How one new mission gets its title, decided once per mission. */
export interface MissionTitlePlan {
  /** The first send's `missionTitle`: set only when the server titles it. */
  send: MissionTitle | undefined;
  /** Set when the client titles the card itself after its row lands. */
  client: MissionTitle | undefined;
}

/**
 * Plan a new mission's title from the deployment's capability snapshot.
 * `null` (not loaded) and an absent flag both keep the client flow, which
 * every deployment still serves.
 */
export function planMissionTitle(
  capabilities: Pick<Capabilities, "missionTitleOnSend"> | null | undefined,
  title: MissionTitle | undefined,
): MissionTitlePlan {
  if (!title) return { send: undefined, client: undefined };
  return capabilities?.missionTitleOnSend === true
    ? { send: title, client: undefined }
    : { send: undefined, client: title };
}

/** Model output trimmed to a card title: at most 6 words and 64 characters. */
export function cleanGeneratedTitle(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeSpaces(value)
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();
  if (!normalized) return null;
  const words = normalized.split(" ").slice(0, 6);
  return takeChars(words.join(" "), 64);
}

/** What the client title flow needs from its binding. */
export interface ClientMissionTitleOps {
  /**
   * The runtime's one-shot title for `text` (`conversations.suggestTitle`),
   * or `undefined` when there is no runtime to ask (no agent scope).
   */
  suggestTitle: ((text: string) => Promise<{ title: string }>) | undefined;
  /** PATCH the card's title. */
  rename: (title: string) => Promise<unknown>;
  /** Where a failed title pass is logged; the fallback title stays. */
  warn: (message: string, detail: string) => void;
}

/**
 * The client half of {@link planMissionTitle}: title the landed card from the
 * runtime's answer. Cosmetic, so it never throws. A runtime that answers
 * nothing or fails leaves a whitespace-collapsed 60-character truncation (or
 * "New chat"), which is PATCHed when it differs from the fallback.
 */
export async function titleMissionFromClient(
  title: MissionTitle,
  ops: ClientMissionTitleOps,
): Promise<void> {
  try {
    const summary = await suggestedTitle(title.text, ops.suggestTitle);
    const next = cleanGeneratedTitle(summary) ?? title.fallback;
    if (next === title.fallback) return;
    await ops.rename(next);
  } catch (err) {
    ops.warn(
      "[mission-title] keeping fallback title",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function suggestedTitle(
  text: string,
  suggest: ClientMissionTitleOps["suggestTitle"],
): Promise<string> {
  const truncated = text.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
  if (!suggest) return truncated;
  try {
    const clean = (await suggest(text)).title.trim();
    return clean || truncated;
  } catch {
    return truncated;
  }
}

function normalizeSpaces(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(" ");
}

function takeChars(value: string, count: number): string {
  return [...value].slice(0, count).join("");
}
