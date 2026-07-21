import {
  applyRoutineUpdate,
  canonicalProviderId,
  createRoutine,
  getPreference,
  isValidTriggerBinding,
  loadRoutines,
  saveRoutines,
  upsertById,
  validateSchedule,
} from "@houston/domain";
import type { NewRoutine, Routine, RoutineUpdate } from "@houston/protocol";
import { hostProvider } from "../providers";
import type { Vfs } from "../vfs";
import { withDocLock } from "./doc-lock";

/**
 * The merge-safe routine write path, shared by the authenticated agent-data
 * route (routes/agent-data.ts) and the runtime `save_routine` tool's sandbox
 * route (routes/routines-sandbox.ts). BOTH mutate the SAME routines.json through
 * a read-modify-write (loadRoutines -> create/apply -> upsertById -> saveRoutines)
 * so a second write never clobbers a routine a first one persisted. The runtime
 * must NEVER wholesale-replace the file (the isolated-setup-chat bug that deleted
 * task #1 when task #2 was created); this is the one blessed write path.
 */

/**
 * The rejection a routine write earns when it carries a `trigger` binding on a
 * deployment with no trigger backend: the automation could never wake, so we
 * refuse it up front rather than persist a dead routine. Written as a sentence
 * the agent can relay verbatim to a non-technical user (no jargon).
 */
export const NO_TRIGGER_BACKEND_WRITE_ERROR =
  "Event triggers are not available here. Give this automation a schedule instead.";

/**
 * A routine has EXACTLY ONE wake mechanism: a cron `schedule` or an event
 * `trigger`. Reject "both" or "neither" (normalizeRoutines drops such an entry
 * on the next read, which would silently lose the write) and a malformed trigger
 * binding, so the caller learns immediately. Returns the reason, else null.
 */
export const wakeMechanismError = (
  body: Record<string, unknown>,
): string | null => {
  const hasSchedule = typeof body.schedule === "string" && body.schedule !== "";
  const hasTrigger = body.trigger != null;
  if (hasSchedule === hasTrigger) {
    return "a routine needs exactly one of 'schedule' or 'trigger'";
  }
  if (hasTrigger && !isValidTriggerBinding(body.trigger)) {
    return "invalid 'trigger' binding";
  }
  return null;
};

/**
 * Reject a provider pin naming a provider this host has never heard of —
 * otherwise the typo saves and every fired run errors. Validated through the
 * SAME canonical mapping the fire path uses (routinePin), so a Rust-era alias
 * ("claude", "codex") that still lives in a migrated routines.json round-trips
 * through an edit without a spurious rejection. Model ids are validated at
 * dispatch (the catalog is the runtime's). Returns the reason, else null.
 */
export const providerPinError = (
  body: Record<string, unknown>,
): string | null => {
  if (typeof body.provider !== "string" || !body.provider) return null;
  const canonical = canonicalProviderId(body.provider);
  return canonical && hostProvider(canonical)
    ? null
    : `unknown provider: ${body.provider}`;
};

/** Common gate options for both write paths. */
export interface RoutineWriteOptions {
  /** Whether this deployment can fire event-driven routines (Houston Cloud). */
  triggersEnabled: boolean;
  /** ISO clock the caller supplies (domain stays pure). */
  nowIso: string;
}

/**
 * Create a routine merge-safely. Runs the SAME create-time gates as the
 * authenticated POST (name/prompt present, exactly one wake, trigger-backend
 * availability, valid cron, known provider pin), then reads the existing file,
 * appends the new routine, and writes the whole survivor set back. Returns the
 * created routine or a plain-language error the caller relays.
 */
export async function createRoutineChecked(
  vfs: Vfs,
  root: string,
  workspaceId: string,
  body: Record<string, unknown>,
  opts: RoutineWriteOptions & { createdBy?: string },
): Promise<{ routine: Routine } | { error: string }> {
  for (const field of ["name", "prompt"]) {
    if (!body[field] || typeof body[field] !== "string") {
      return { error: `missing '${field}'` };
    }
  }
  // Exactly one wake mechanism (a cron schedule OR an event trigger).
  const wakeErr = wakeMechanismError(body);
  if (wakeErr) return { error: wakeErr };
  // No trigger backend here -> a trigger-bound routine could never wake.
  if (body.trigger != null && !opts.triggersEnabled) {
    return { error: NO_TRIGGER_BACKEND_WRITE_ERROR };
  }
  const input = body as unknown as NewRoutine;
  // Reject a bad cron NOW (schedule routines only) — otherwise the routine saves
  // and silently never fires. Validate against the single account-wide zone
  // (HOU-470): there is no per-routine timezone. Trigger routines have no cron.
  if (typeof input.schedule === "string") {
    const accountTz = await getPreference(vfs, workspaceId, "timezone");
    const scheduleErr = validateSchedule(input.schedule, accountTz);
    if (scheduleErr) return { error: `invalid schedule: ${scheduleErr}` };
  }
  const providerErr = providerPinError(body);
  if (providerErr) return { error: providerErr };

  // Load→save under the per-doc lock so concurrent routine writes can't drop
  // each other's entries (same hazard as activities; see doc-lock.ts).
  return await withDocLock(`${root}#routines`, async () => {
    const { items } = await loadRoutines(vfs, root);
    const routine = createRoutine(
      input,
      crypto.randomUUID(),
      opts.nowIso,
      opts.createdBy,
    );
    await saveRoutines(vfs, root, upsertById(items, routine));
    return { routine };
  });
}

/**
 * Update a routine by id merge-safely. Reads the file, applies the partial update
 * to the matching entry, re-checks the exactly-one-wake invariant on the APPLIED
 * result (e.g. `{trigger: null}` on a trigger routine clears its only wake), the
 * trigger-backend gate, the cron, and the provider pin, then writes the whole set
 * back. `{ notFound: true }` when no routine has that id; else the updated routine
 * or a plain-language error.
 */
export async function updateRoutineChecked(
  vfs: Vfs,
  root: string,
  workspaceId: string,
  itemId: string,
  update: Record<string, unknown>,
  opts: RoutineWriteOptions & { actorSub?: string },
): Promise<{ routine: Routine } | { error: string } | { notFound: true }> {
  // The whole read-modify-write sits inside the lock: re-loading here is what
  // makes the final save apply to the list a concurrent writer just produced.
  return await withDocLock(`${root}#routines`, async () => {
    const { items } = await loadRoutines(vfs, root);
    const current = items.find((r) => r.id === itemId);
    if (!current) return { notFound: true };
    // An update may switch a routine to an event trigger; reject a malformed
    // binding before it is persisted (normalizeRoutines would drop it).
    if (update.trigger != null && !isValidTriggerBinding(update.trigger)) {
      return { error: "invalid 'trigger' binding" };
    }
    const next = applyRoutineUpdate(
      current,
      update as RoutineUpdate,
      opts.nowIso,
      opts.actorSub,
    );
    // The APPLIED result must still hold the exactly-one-wake invariant — persisting
    // a wake-less routine loses it silently (normalizeRoutines drops it on read).
    const nextWakeErr = wakeMechanismError(
      next as unknown as Record<string, unknown>,
    );
    if (nextWakeErr) return { error: nextWakeErr };
    // The APPLIED result carries a trigger, but this deployment cannot fire one →
    // refuse. Converting the routine to a schedule (trigger cleared) passes.
    if (
      (next as { trigger?: unknown }).trigger != null &&
      !opts.triggersEnabled
    ) {
      return { error: NO_TRIGGER_BACKEND_WRITE_ERROR };
    }
    if (typeof next.schedule === "string") {
      const accountTz = await getPreference(vfs, workspaceId, "timezone");
      const scheduleErr = validateSchedule(next.schedule, accountTz);
      if (scheduleErr) return { error: `invalid schedule: ${scheduleErr}` };
    }
    const providerErr = providerPinError(update);
    if (providerErr) return { error: providerErr };

    await saveRoutines(vfs, root, upsertById(items, next));
    return { routine: next };
  });
}
