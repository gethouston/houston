import type { Capabilities, MissionTitle } from "@houston/wire-types";

export interface MissionTitlePlan {
  send: MissionTitle | undefined;
  client: MissionTitle | undefined;
}

export function planMissionTitle(
  capabilities: Pick<Capabilities, "missionTitleOnSend"> | null | undefined,
  title: MissionTitle | undefined,
): MissionTitlePlan {
  if (!title) return { send: undefined, client: undefined };
  return capabilities?.missionTitleOnSend === true
    ? { send: title, client: undefined }
    : { send: undefined, client: title };
}

export function cleanGeneratedTitle(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeSpaces(value)
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();
  if (!normalized) return null;
  const words = normalized.split(" ").slice(0, 6);
  return takeChars(words.join(" "), 64);
}

export interface ClientMissionTitleOps {
  suggestTitle: ((text: string) => Promise<{ title: string }>) | undefined;
  rename: (title: string) => Promise<unknown>;
  warn: (message: string, detail: string) => void;
}

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
