import type { GrantAccount } from "./grant-store";
import type { ConnectedAccountInfo, ToolMatch } from "./types";

/**
 * Pure grant-policy helpers (no I/O) shared by the grant routes + the sandbox
 * proxy. The grant unit is a connected ACCOUNT; enforcement derives the granted
 * toolkit SET from the accounts and resolves which account an execute pins.
 */

/**
 * Composio slug convention: an action is named `<TOOLKIT>_<REST>` with the
 * toolkit slug uppercased VERBATIM, so a multi-word slug keeps its underscores
 * (`google_maps` → `GOOGLE_MAPS_GET_ROUTE`, `gmail` → `GMAIL_SEND_EMAIL`). Attach
 * an action to a toolkit by matching the FULL slug as a prefix up to an
 * underscore boundary — never the segment before the first `_`, which would
 * mis-attribute `GOOGLE_MAPS_GET_ROUTE` to a nonexistent `google` toolkit and so
 * 403 a genuinely-granted `google_maps`.
 */
export function actionInToolkit(action: string, toolkit: string): boolean {
  const a = action.toLowerCase();
  const t = toolkit.toLowerCase();
  return a === t || a.startsWith(`${t}_`);
}

/** The distinct toolkit slugs covered by a granted-account set. */
export function grantedToolkits(accounts: GrantAccount[]): string[] {
  const seen = new Set<string>();
  for (const a of accounts) seen.add(a.toolkit);
  return [...seen];
}

/** The granted toolkit an action belongs to, or null when none matches. */
export function toolkitForAction(
  action: string,
  toolkits: string[],
): string | null {
  return toolkits.find((t) => actionInToolkit(action, t)) ?? null;
}

/**
 * Keep the matches whose toolkit is granted (case-insensitive) — plus every
 * match marked NOT connected. Grants only exist over connected toolkits, so a
 * `connected: false` match can never be granted; dropping it would kill the
 * in-chat connect discovery (HOU-670: search surfaces not-connected apps so
 * the agent can offer the connect card). Execute stays fully enforced.
 */
export function filterMatchesToGranted(
  matches: ToolMatch[],
  toolkits: string[],
): ToolMatch[] {
  const set = new Set(toolkits.map((t) => t.toLowerCase()));
  return matches.filter(
    (m) => m.connected === false || set.has(m.toolkit.toLowerCase()),
  );
}

/**
 * Pick the connected account an execute runs against, from the toolkit's granted
 * accounts (already enriched with labels):
 *  - a requested id/label → match by exact `connectionId` OR case-insensitive
 *    `accountLabel`; no match ⇒ `account_not_granted`.
 *  - none requested + exactly one granted account ⇒ auto-pin it.
 *  - none requested + more than one ⇒ `account_required` (list them so the caller
 *    can retry with an explicit account).
 */
export type AccountResolution =
  | { ok: true; connectionId: string }
  | { ok: false; error: "account_not_granted" }
  | { ok: false; error: "account_required"; accounts: ConnectedAccountInfo[] };

export function resolveExecuteAccount(
  accounts: ConnectedAccountInfo[],
  requested: string | undefined,
): AccountResolution {
  if (requested !== undefined) {
    const needle = requested.toLowerCase();
    const match = accounts.find(
      (a) =>
        a.connectionId === requested ||
        a.accountLabel?.toLowerCase() === needle,
    );
    return match
      ? { ok: true, connectionId: match.connectionId }
      : { ok: false, error: "account_not_granted" };
  }
  const [only] = accounts;
  if (only && accounts.length === 1) {
    return { ok: true, connectionId: only.connectionId };
  }
  return { ok: false, error: "account_required", accounts };
}

export type AccountIdValidation =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/** Validate + dedupe a replace-set PUT body: an array of connection ids. Real
 *  membership (does the id belong to the user) is checked by the route against
 *  the provider; this only guards shape. */
export function normalizeAccountIds(input: unknown): AccountIdValidation {
  if (!Array.isArray(input)) {
    return { ok: false, error: "missing 'accounts' (array of connection ids)" };
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string" || raw.length === 0) {
      return { ok: false, error: `invalid account id: ${JSON.stringify(raw)}` };
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      ids.push(raw);
    }
  }
  return { ok: true, ids };
}
