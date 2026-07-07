import type {
  Activity,
  ActivityUpdate,
  NewActivity,
  PendingInteraction,
} from "@houston/protocol";
import { docKey } from "./layout";
import {
  type DocDiagnostic,
  loadJson,
  saveJson,
  type TextStore,
} from "./store";

/** Board statuses, per ui/agent-schemas/activity.schema.json. */
export const ACTIVITY_STATUSES = [
  "running",
  "needs_you",
  "done",
  "error",
  "archived",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One interaction step is valid when it carries a string `id` and the fields
 *  its `kind` requires: a `question` needs a string `question`, a `connect`
 *  needs a string `toolkit`. */
const isValidInteractionStep = (v: unknown): boolean => {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.kind === "question") return typeof v.question === "string";
  if (v.kind === "connect") return typeof v.toolkit === "string";
  return false;
};

/** Validate the pending_interaction shape (mirrors the schema): a non-empty
 *  `steps` array, each step a valid question or connect. An old top-level
 *  `{kind, questions}` / `{kind, toolkit}` shape has no `steps`, so a value
 *  persisted before the step-sequence change is dropped. */
const isValidPendingInteraction = (v: unknown): v is PendingInteraction =>
  isRecord(v) &&
  Array.isArray(v.steps) &&
  v.steps.length > 0 &&
  v.steps.every(isValidInteractionStep);

/**
 * Normalize a raw activity array (agents write this file with file tools, so
 * junk happens): entries missing the required identity fields are dropped and
 * reported; unknown statuses are preserved as-is (forward compat — the UI
 * renders unknown statuses neutrally).
 */
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

/** Materialize a NewActivity. Caller supplies identity + clock (domain stays pure). */
export function createActivity(
  input: NewActivity,
  id: string,
  nowIso: string,
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
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
  };
}

/** Apply a partial update; undefined fields leave the current value alone (explicit null clears). */
export function applyActivityUpdate(
  current: Activity,
  update: ActivityUpdate,
  nowIso: string,
): Activity {
  const { pending_interaction, ...rest } = update;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  const next = { ...current, ...defined, updated_at: nowIso } as Activity;
  if (pending_interaction === null) {
    delete next.pending_interaction;
  } else if (pending_interaction !== undefined) {
    next.pending_interaction = pending_interaction;
  }
  return next;
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
