import type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
} from "@houston/protocol";
import { docKey } from "./layout";
import {
  type DocDiagnostic,
  loadJson,
  saveJson,
  type TextStore,
} from "./store";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A trigger binding is well-formed. Discriminated on `kind`:
 *  - `"webhook"` — an incoming-webhook wake. Valid iff `key_prefix` is absent or
 *    a string (display-only "wh_xxxxxxxx" label; the secret never lives here).
 *    No Composio fields are required — the gateway mints the URL out of band.
 *  - absent / `"composio"` — a Composio trigger. Valid iff it carries the two
 *    identifying strings and an object config. `connected_account_id` is optional
 *    (pinned only when the user has more than one account for the toolkit).
 *
 * A missing `kind` reads as Composio, so every pre-webhook binding validates
 * unchanged (no migration). Exported so the write path (routes) rejects a
 * malformed binding up front rather than persisting one that `normalizeRoutines`
 * would silently drop on the next read.
 */
export const isValidTriggerBinding = (v: unknown): boolean => {
  if (!isRecord(v)) return false;
  if (v.kind === "webhook") {
    return v.key_prefix === undefined || typeof v.key_prefix === "string";
  }
  return (
    typeof v.toolkit === "string" &&
    typeof v.trigger_slug === "string" &&
    isRecord(v.trigger_config)
  );
};

/**
 * Normalize raw routines: defaults per the schema; entries without identity or
 * without exactly one valid wake mechanism dropped + reported.
 *
 * FORWARD-COMPAT CONTRACT: this read is tolerant of trigger routines (a
 * `trigger` binding and no `schedule`) so that an engine build predating
 * event-driven routines does NOT erase them on the next write. Every save writes
 * back only the survivors, so a reader that dropped schedule-less entries would
 * silently delete a user's trigger automations. Rules: keep a routine with a
 * valid `trigger` and no schedule, keep the legacy schedule-only shape, and drop
 * (with a diagnostic) any entry that has BOTH or NEITHER, or whose `trigger` is
 * malformed. Beta policy: no silent loss — every drop surfaces a diagnostic.
 */
export function normalizeRoutines(
  raw: unknown,
  key: string,
): { items: Routine[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return {
      items: [],
      diagnostics: [{ key, message: "routines.json is not an array" }],
    };
  }
  const items: Routine[] = [];
  const diagnostics: DocDiagnostic[] = [];
  const drop = (message: string, entry: unknown) =>
    diagnostics.push({
      key,
      message: `${message}: ${JSON.stringify(entry)?.slice(0, 120)}`,
    });
  for (const entry of raw) {
    if (
      !(
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.prompt === "string"
      )
    ) {
      drop("dropped malformed routine entry", entry);
      continue;
    }
    const hasSchedule = typeof entry.schedule === "string";
    const triggerPresent = entry.trigger != null;
    if (triggerPresent && !isValidTriggerBinding(entry.trigger)) {
      drop("dropped routine with malformed trigger", entry);
      continue;
    }
    // Exactly one wake mechanism. `hasSchedule === triggerPresent` is true when
    // both are set (ambiguous) or neither is (never fires) — both are invalid.
    if (hasSchedule === triggerPresent) {
      drop("dropped routine without exactly one of schedule/trigger", entry);
      continue;
    }
    // HOU-470 removed the per-routine `timezone` override (one account-wide
    // zone now) and HOU-725 removed `description` (display-only, nothing
    // consumed it). Routines written by older builds still carry the stray
    // keys on disk; drop them on read so they do not round-trip back out,
    // an idempotent no-migration cleanup (they disappear on next write).
    const item = {
      enabled: true,
      suppress_when_silent: false,
      chat_mode: entry.chat_mode === "per_run" ? "per_run" : "shared",
      integrations: Array.isArray(entry.integrations) ? entry.integrations : [],
      created_at: "",
      updated_at: "",
      ...entry,
    } as Routine & { timezone?: unknown; description?: unknown };
    delete item.timezone;
    delete item.description;
    // A trigger routine carries no schedule; a stray non-string schedule (e.g.
    // an explicit null) must not round-trip as an invalid wake field.
    if (!hasSchedule) delete item.schedule;
    items.push(item);
  }
  return { items, diagnostics };
}

export async function loadRoutines(
  store: TextStore,
  root: string,
): Promise<{ items: Routine[]; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "routines");
  return normalizeRoutines(await loadJson<unknown>(store, key, []), key);
}

export async function saveRoutines(
  store: TextStore,
  root: string,
  items: Routine[],
): Promise<void> {
  await saveJson(store, docKey(root, "routines"), items);
}

/**
 * Materialize a NewRoutine. Caller supplies identity + clock (domain stays pure).
 * `createdBy` (the authenticated creator's Supabase `sub`) is recorded on the
 * routine so fired turns can act as them (C2); omit it (legacy / single-user)
 * and the field is simply absent — no migration, tolerant read.
 */
export function createRoutine(
  input: NewRoutine,
  id: string,
  nowIso: string,
  createdBy?: string,
): Routine {
  return {
    id,
    name: input.name,
    prompt: input.prompt,
    enabled: input.enabled ?? true,
    suppress_when_silent: input.suppress_when_silent ?? false,
    chat_mode: input.chat_mode ?? "shared",
    // Per-routine provider/model/effort pins. Absent (null) means inherit the
    // agent's config at dispatch — see resolveTurnModel in the runtime.
    provider: input.provider ?? null,
    model: input.model ?? null,
    effort: input.effort ?? null,
    integrations: input.integrations ?? [],
    created_at: nowIso,
    updated_at: nowIso,
    // Exactly one wake mechanism, written only when present — a cron routine
    // carries no `trigger` and a trigger routine no `schedule` (normalizeRoutines
    // drops entries that end up with both or neither). The caller supplies one.
    ...(input.schedule ? { schedule: input.schedule } : {}),
    ...(input.trigger ? { trigger: input.trigger } : {}),
    // Only write the keys when known, so legacy routines stay absent (not "": …).
    ...(input.setup_activity_id
      ? { setup_activity_id: input.setup_activity_id }
      : {}),
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

/**
 * Apply a partial update. Undefined leaves a field alone. A stray legacy
 * `timezone` key is ignored: the per-routine override was removed in HOU-470
 * (one account-wide zone), so a client still sending it must not write it back.
 * `created_by` is server-owned identity, never client-updateable: only
 * `actorSub` — the server's own verified resolution of WHO is editing (C2) —
 * may re-stamp it. The last verified editor is who a fired routine acts as
 * (they authorized the routine's current shape), and re-stamping on edit also
 * heals routines recorded before gateway-fronted pods stamped real subs.
 */
export function applyRoutineUpdate(
  current: Routine,
  update: RoutineUpdate,
  nowIso: string,
  actorSub?: string,
): Routine {
  const defined = Object.fromEntries(
    Object.entries(update).filter(
      ([k, v]) => v !== undefined && k !== "timezone" && k !== "created_by",
    ),
  );
  // A null wake key means "clear that mechanism" (the client keeps or moves to
  // the other one — the UI sends `{schedule, trigger: null}` on every cron
  // save). The null itself must never be written, and clearing one side must
  // never delete the other: a routine left with neither wake is dropped by
  // normalizeRoutines on the next read and purged from disk by the next save.
  const clearsTrigger = defined.trigger === null;
  const clearsSchedule = defined.schedule === null;
  if (clearsTrigger) delete defined.trigger;
  if (clearsSchedule) delete defined.schedule;
  // `...current` preserves `created_by` when no verified actor is known — a
  // client can never reassign a routine's acting identity through the body.
  const next = {
    ...current,
    ...defined,
    ...(actorSub ? { created_by: actorSub } : {}),
    updated_at: nowIso,
  } as Routine;
  // A routine has exactly one wake mechanism, so SETTING one clears the other:
  // switching a cron routine to an event wake (or back) must not leave both set,
  // which normalizeRoutines would drop on the next read. Only a real value
  // switches — a null cleared itself above, not its counterpart.
  if (defined.schedule !== undefined) delete next.trigger;
  if (defined.trigger !== undefined) delete next.schedule;
  if (clearsTrigger) delete next.trigger;
  if (clearsSchedule) delete next.schedule;
  return next;
}

/** Normalize raw routine runs (written by the scheduler; read by the UI). */
export function normalizeRoutineRuns(
  raw: unknown,
  key: string,
): { items: RoutineRun[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return {
      items: [],
      diagnostics: [{ key, message: "routine_runs.json is not an array" }],
    };
  }
  const items: RoutineRun[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.routine_id === "string" &&
      typeof entry.status === "string"
    ) {
      items.push({ session_key: "", started_at: "", ...entry } as RoutineRun);
    } else {
      diagnostics.push({
        key,
        message: `dropped malformed routine run: ${JSON.stringify(entry)?.slice(0, 120)}`,
      });
    }
  }
  return { items, diagnostics };
}

export async function loadRoutineRuns(
  store: TextStore,
  root: string,
): Promise<{ items: RoutineRun[]; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "routine_runs");
  return normalizeRoutineRuns(await loadJson<unknown>(store, key, []), key);
}

export async function saveRoutineRuns(
  store: TextStore,
  root: string,
  items: RoutineRun[],
): Promise<void> {
  await saveJson(store, docKey(root, "routine_runs"), items);
}
