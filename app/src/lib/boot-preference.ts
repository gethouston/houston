/**
 * The boot read of a DEVICE preference: "which space was last open", "which
 * agent was last current". Every one of them restores a convenience, and none of
 * them is what the user came for.
 *
 * A device preference lives in this browser's localStorage, which can refuse the
 * read outright (hardened webview, blocked site data, partitioned storage), and
 * the adapter rejects when it does — a store that cannot answer is "unknown",
 * never "unset" (`packages/engine-adapter/src/client/device-prefs.ts`). At boot
 * that distinction has exactly one honest resolution: carry on as if the
 * preference were unset, because a user whose storage is blocked must still land
 * in their workspace with their agents. The alternative is what this function
 * exists to prevent — the rejection joining a LOAD's rejection (both are awaited
 * together) and painting the workspace-load failure screen over an account whose
 * spaces listed perfectly well.
 *
 * Silent to the user, never silent to us: the read is reported (one Sentry issue
 * — the wire layer already captured it, so this only adds the boot context to
 * the frontend log) so a blocked store shows up as itself instead of as a
 * mysteriously forgotten preference.
 *
 * Only for READS, and only at boot. A device preference WRITE is a user action
 * (picking a palette, switching space) and must keep failing loudly so the
 * caller reverts what it optimistically painted.
 */

import { logAndReportError } from "./error-report";
import { tauriPreferences } from "./tauri";

export async function readBootPreference(key: string): Promise<string | null> {
  try {
    return await tauriPreferences.get(key);
  } catch (err) {
    logAndReportError(`device_pref_unreadable:${key}`, err);
    return null;
  }
}
