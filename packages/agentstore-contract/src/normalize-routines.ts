/**
 * The forgiving backfill for `ir.routines`, run before validation.
 *
 * It fixes only what has ONE safe answer: a missing id, a toolkit slug in the
 * wrong case. Anything else malformed (a wake with no `kind`, a composio wake
 * missing its trigger slug, a prompt over the cap) is left exactly as sent so
 * `agentIrSchema` REJECTS the publish — a publisher has to learn their routine
 * did not make it, and a silently dropped automation is the one outcome worse
 * than a 422.
 */
import {
  disambiguate,
  isNonEmptyString,
  isRecord,
  MAX_ID_LEN,
} from "./normalize-shared";

/** Lowercase + trim a composio wake's toolkit, uppercase + trim its slug. */
function normalizeWake(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const wake = { ...raw };
  if (typeof wake.toolkit === "string")
    wake.toolkit = wake.toolkit.trim().toLowerCase();
  if (typeof wake.triggerSlug === "string")
    wake.triggerSlug = wake.triggerSlug.trim().toUpperCase();
  return wake;
}

/**
 * Normalize the `routines` value of an IR candidate. Returns the value to store
 * back on the candidate, pushing a note for every backfill. `undefined` in
 * (the field was omitted) means `undefined` out — the schema's `.default([])`
 * owns that case, not this pass.
 */
export function normalizeRoutinesField(raw: unknown, notes: string[]): unknown {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    notes.push("routines was not a list, defaulted to none");
    return [];
  }

  const seen = new Set<string>();
  const out: unknown[] = [];
  raw.forEach((entry, i) => {
    if (!isRecord(entry)) {
      notes.push(`routines[${i}] dropped (not an object)`);
      return;
    }
    const routine: Record<string, unknown> = { ...entry };
    let base = isNonEmptyString(routine.id)
      ? routine.id.trim().slice(0, MAX_ID_LEN)
      : "";
    if (!base) {
      base = `routine-${i + 1}`;
      notes.push(`routines[${i}].id derived`);
    }
    const uniq = disambiguate(base, seen);
    seen.add(uniq);
    routine.id = uniq;
    if (routine.wake !== undefined) routine.wake = normalizeWake(routine.wake);
    out.push(routine);
  });
  return out;
}
