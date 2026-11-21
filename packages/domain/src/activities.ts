import {
  type Activity,
  type ActivityContributor,
  type ActivityStamp,
  type ActivityUpdate,
  isPendingInteraction,
  type NewActivity,
  normalizeTurnMode,
  resolveInteractionPatch,
} from "@houston/protocol";
import { sanitizeActivityStamps } from "./activity-stamps";
import { cloneContributor, upsertContributor } from "./contributors";
import { docKey } from "./layout";
import { toCanonicalProviderId } from "./provider-dialect";
import {
  type DocDiagnostic,
  loadJson,
  saveJson,
  type TextStore,
} from "./store";

export const ACTIVITY_STATUSES = [
  "running",
  "needs_you",
  "done",
  "error",
  "archived",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isValidPendingInteraction = isPendingInteraction;

export function normalizeActivities(
  raw: unknown,
  key: string,
): { items: Activity[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return {
      items: [],
      diagnostics: [{ key, message: "activity.json is not an array" }],
    };
  }
  const items: Activity[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.title === "string" &&
      typeof entry.status === "string"
    ) {
      const activity = { description: "", ...entry } as Activity;
      sanitizeActivityStamps(activity, entry);
      if (
        entry.pending_interaction !== undefined &&
        !isValidPendingInteraction(entry.pending_interaction)
      ) {
        delete activity.pending_interaction;
        diagnostics.push({
          key,
          message: `dropped invalid pending_interaction on activity ${entry.id}: ${JSON.stringify(entry.pending_interaction)?.slice(0, 120)}`,
        });
      }
      items.push(activity);
    } else {
      diagnostics.push({
        key,
        message: `dropped malformed activity entry: ${JSON.stringify(entry)?.slice(0, 120)}`,
      });
    }
  }
  return { items, diagnostics };
}

export async function loadActivities(
  store: TextStore,
  root: string,
): Promise<{ items: Activity[]; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "activity");
  return normalizeActivities(await loadJson<unknown>(store, key, []), key);
}

export async function saveActivities(
  store: TextStore,
  root: string,
  items: Activity[],
): Promise<void> {
  await saveJson(store, docKey(root, "activity"), items);
}

export function createActivity(
  input: NewActivity,
  id: string,
  nowIso: string,
  author?: ActivityContributor,
): Activity {
  return {
    id,
    title: input.title,
    description: input.description ?? "",
    status: "running",
    updated_at: nowIso,
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
    ...(input.worktree_path !== undefined
      ? { worktree_path: input.worktree_path }
      : {}),
    ...(input.provider !== undefined
      ? { provider: toCanonicalProviderId(input.provider) }
      : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.mode !== undefined
      ? { mode: normalizeTurnMode(input.mode) }
      : {}),
    ...(input.origin_session_key !== undefined
      ? { origin_session_key: input.origin_session_key }
      : {}),
    ...(author !== undefined
      ? {
          created_by: author.user_id,
          contributors: [cloneContributor(author)],
        }
      : {}),
  };
}

export function applyActivityUpdate(
  current: Activity,
  update: ActivityUpdate,
  nowIso: string,
  author?: ActivityContributor,
  stamp?: ActivityStamp,
): Activity {
  const { pending_interaction, provider, model, ...rest } = update;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  const next = { ...current, ...defined, updated_at: nowIso } as Activity;
  if (stamp === "last_message") next.last_message_at = nowIso;
  else next.last_message_at ??= current.updated_at ?? nowIso;
  if (provider === null) delete next.provider;
  else if (provider !== undefined)
    next.provider = toCanonicalProviderId(provider);
  if (model === null) delete next.model;
  else if (model !== undefined) next.model = model;
  const outcome = resolveInteractionPatch({
    patched: pending_interaction,
    stored: next.pending_interaction,
    status: update.status,
  });
  if (outcome.kind === "set") next.pending_interaction = outcome.interaction;
  else if (outcome.kind === "clear") delete next.pending_interaction;
  return author !== undefined ? upsertContributor(next, author) : next;
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const i = items.findIndex((x) => x.id === item.id);
  if (i === -1) return [...items, item];
  return [...items.slice(0, i), item, ...items.slice(i + 1)];
}

export function removeById<T extends { id: string }>(
  items: T[],
  id: string,
): { items: T[]; removed: boolean } {
  const next = items.filter((x) => x.id !== id);
  return { items: next, removed: next.length !== items.length };
}
