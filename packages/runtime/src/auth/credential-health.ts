import { currentCredentialScope } from "../session/acting-context";
import { credentialFingerprint } from "./credential-fingerprint";
import {
  forgetProviderMarks,
  readProviderMarks,
  writeProviderMarks,
} from "./provider-marks";

/**
 * Turn-time truth fed back into provider status.
 *
 * Presence/expiry checks (storage.ts, credentials-file.ts) catch a credential
 * that is VISIBLY dead, but some deaths are invisible on disk: a refresh token
 * rotated away by another login (Anthropic invalidates the previous holder on
 * refresh), a centrally-served token revoked upstream, a Keychain credential
 * `claude auth status` still calls logged-in. The one place those surface is a
 * turn failing with the `unauthenticated` provider error — so when that
 * happens, remember WHICH credential failed and report the provider
 * disconnected (`providerUsable` in ai/providers.ts) while that same
 * credential is still in place.
 *
 * The mark is keyed by a fingerprint of the credential at failure time and
 * AUTO-HEALS the moment the credential changes — a re-login, a pasted key, a
 * fresh centrally-served token, or a credential push all rewrite auth.json or
 * the materialized file, so the connect paths need no explicit clear-wiring
 * (and a serve loop re-applying the SAME dead token cannot flap the status
 * back to connected). A clean turn also clears it, which covers the one
 * change no fingerprint can see: a macOS Keychain re-login.
 *
 * The fingerprint itself (and its credential IO) lives in
 * ./credential-fingerprint.
 *
 * The marks are PERSISTED (auth/provider-marks.ts): a restarted pod would
 * otherwise report a dead token as Connected until the next failing turn, and
 * a routine firing in that window fails while the screen says connected
 * (PRODUCT-1475). That cannot wedge a provider off after an out-of-band fix
 * because every mark carries the fingerprint of the credential it was recorded
 * against — any credential change auto-heals a loaded mark exactly as it heals
 * an in-memory one.
 *
 * Marks are keyed `${scopeKey}:${provider}` by acting identity (HOU-976):
 * on a shared pod two members hold two different credentials for the same
 * provider, so one member's dead token must not report the OTHER member's
 * provider disconnected.
 */

/** How long an exhausted-quota mark holds when the provider named no reset. */
const QUOTA_MARK_TTL_MS = 60 * 60 * 1000;

/** The mark key for a provider under the CURRENT acting identity. */
function markFor(id: string): string {
  return `${currentCredentialScope().key}:${id}`;
}

/** Record that a turn failed authentication on this provider's current
 *  credential. `fingerprint` is injectable for tests. */
export function noteAuthFailure(id: string, fingerprint?: string): void {
  const marks = readProviderMarks();
  marks.authFailed.set(markFor(id), fingerprint ?? credentialFingerprint(id));
  writeProviderMarks(marks);
}

/**
 * Record that this provider's account ran OUT OF CREDITS / quota. Distinct
 * from an auth failure: the credential is valid, so reconnecting fixes
 * nothing — the status surface must say "out of credits", not "reconnect".
 *
 * `resetsAt` is the provider's own reset hint (ISO 8601) when it gave one; an
 * open-ended exhaustion holds for an hour, after which the next turn re-learns
 * the truth rather than leaving the account marked dead forever.
 */
export function noteQuotaExhausted(
  id: string,
  resetsAt: string | null,
  fingerprint?: string,
): void {
  const parsed = resetsAt ? Date.parse(resetsAt) : Number.NaN;
  const marks = readProviderMarks();
  marks.quotaExhausted.set(markFor(id), {
    fingerprint: fingerprint ?? credentialFingerprint(id),
    expiresAt: Number.isNaN(parsed) ? Date.now() + QUOTA_MARK_TTL_MS : parsed,
  });
  writeProviderMarks(marks);
}

/** Heal both marks without a credential change — a turn that COMPLETED on this
 *  provider proved the credential both authenticates and has quota left
 *  (exec-turn / turn-session call this on every clean turn; cheap no-op when
 *  nothing is marked). */
export function clearProviderMarks(id: string): void {
  const marks = readProviderMarks();
  const mark = markFor(id);
  // Both deletes must run (no short-circuit): a turn can heal an auth mark and
  // a quota mark at once.
  const hadAuth = marks.authFailed.delete(mark);
  const hadQuota = marks.quotaExhausted.delete(mark);
  if (!hadAuth && !hadQuota) return;
  writeProviderMarks(marks);
}

/**
 * Whether this provider's CURRENT credential is the one that failed a turn's
 * authentication. A changed credential deletes the mark (auto-heal), so the
 * check stays true only while retrying would fail the same way. The common
 * path (nothing marked) does no credential IO. `fingerprint` is injectable for
 * tests.
 */
export function authFailureActive(id: string, fingerprint?: string): boolean {
  const marks = readProviderMarks();
  const mark = markFor(id);
  const marked = marks.authFailed.get(mark);
  if (marked === undefined) return false;
  if (marked !== (fingerprint ?? credentialFingerprint(id))) {
    marks.authFailed.delete(mark);
    writeProviderMarks(marks);
    return false;
  }
  return true;
}

/**
 * Whether this provider's CURRENT credential is out of quota. Auto-heals the
 * same two ways as an auth mark (a changed credential, a clean turn) plus a
 * third the provider itself names: the reset instant passing.
 */
export function quotaExhaustedActive(
  id: string,
  fingerprint?: string,
): boolean {
  const marks = readProviderMarks();
  const mark = markFor(id);
  const marked = marks.quotaExhausted.get(mark);
  if (marked === undefined) return false;
  const stale =
    marked.expiresAt <= Date.now() ||
    marked.fingerprint !== (fingerprint ?? credentialFingerprint(id));
  if (stale) {
    marks.quotaExhausted.delete(mark);
    writeProviderMarks(marks);
    return false;
  }
  return true;
}

/** Tests only: forget every mark, in memory and on disk. */
export function resetAuthFailures(): void {
  forgetProviderMarks();
}
