import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { endpointFileIn, OPENAI_COMPATIBLE } from "../ai/openai-compatible";
import { claudeCredentialsFile } from "../backends/claude/paths";
import { config } from "../config";
import { readAuthFile } from "./auth-file";

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
 * Reads the persisted credential material directly (auth-file.ts + the
 * materialized Claude file) rather than going through auth/storage.ts — that
 * module reaches the Claude backend, which this module's callers (the
 * backends' error classifiers) sit underneath, and the import cycle is not
 * worth a cached view of the same bytes. In-memory only, deliberately: a
 * restart re-learns the truth from the next turn, and persisting "broken"
 * state could wedge a provider off after an out-of-band fix.
 */

/** provider id → fingerprint of the credential that failed authentication. */
const failed = new Map<string, string>();

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A file's content hash, or "absent" when it can't be read. */
function fileFingerprint(path: string): string {
  try {
    return digest(readFileSync(path));
  } catch {
    return "absent";
  }
}

/**
 * A stable fingerprint of a provider's CURRENT persisted credential material.
 * Two providers span more than their auth.json entry: anthropic also carries
 * the shared-dir credentials file (the Keychain is not observable from here —
 * its rotations heal via the clean-turn clear instead), and the local
 * OpenAI-compatible provider carries its endpoint config (same placeholder
 * key, different server = a different "credential": reconfiguring the
 * endpoint must heal a failure mark).
 */
function credentialFingerprint(id: string): string {
  const cred = readAuthFile(join(config.dataDir, "auth.json"))[id];
  const stored = cred ? digest(JSON.stringify(cred)) : "absent";
  if (id === "anthropic")
    return `${stored}|${fileFingerprint(claudeCredentialsFile())}`;
  if (id === OPENAI_COMPATIBLE)
    return `${stored}|${fileFingerprint(endpointFileIn(config.dataDir))}`;
  return stored;
}

/** Record that a turn failed authentication on this provider's current
 *  credential. `fingerprint` is injectable for tests. */
export function noteAuthFailure(id: string, fingerprint?: string): void {
  failed.set(id, fingerprint ?? credentialFingerprint(id));
}

/** Heal the mark without a credential change — a turn that COMPLETED on this
 *  provider proved the credential works (exec-turn / turn-session call this on
 *  every clean turn; cheap no-op when nothing is marked). */
export function clearAuthFailure(id: string): void {
  failed.delete(id);
}

/**
 * Whether this provider's CURRENT credential is the one that failed a turn's
 * authentication. A changed credential deletes the mark (auto-heal), so the
 * check stays true only while retrying would fail the same way. The common
 * path (nothing marked) does no IO. `fingerprint` is injectable for tests.
 */
export function authFailureActive(id: string, fingerprint?: string): boolean {
  const marked = failed.get(id);
  if (marked === undefined) return false;
  if (marked !== (fingerprint ?? credentialFingerprint(id))) {
    failed.delete(id);
    return false;
  }
  return true;
}

/** Tests only: forget every mark. */
export function resetAuthFailures(): void {
  failed.clear();
}
