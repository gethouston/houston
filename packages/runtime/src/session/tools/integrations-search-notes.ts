/**
 * The integration_search speech acts around the app scope (PRODUCT-1274):
 * what to tell the model when a scoped search came back empty, and the
 * leading notes when the results are NOT certainly the named app's. Split
 * from integrations.ts (the tool plumbing) so the messages live in one place.
 *
 * The host's response carries two flags the speech act depends on:
 *  - `unscopedFallback`: every provider RESOLVED nothing for the scope (a
 *    typo, a guess) and the items are one unscoped retry — other apps'.
 *  - `scopeIgnored`: some provider (a gateway predating the scope contract)
 *    ignored the scope entirely, so the items may be unscoped noise and an
 *    EMPTY result proves nothing about the app existing. Never render a
 *    confident "no such app" over this flag.
 */

/** The empty-result text: why nothing came back decides what may be claimed. */
export function searchEmptyText(
  query: string,
  app: string | undefined,
  scopeIgnored: boolean,
): string {
  if (!app) {
    return `No matching app or action found for "${query}". If the task names an app, search again with \`app\` set to that app before concluding anything. Otherwise this is a genuine not-found: no such app or action exists here. It does NOT mean an app is blocked or withheld by policy.`;
  }
  if (scopeIgnored) {
    return `Nothing matched "${query}", and this Houston deployment could not verify the app scope "${app}" — so this result proves NOTHING about whether that app exists or what it can do. Retry once with different wording (or the app's exact name), and do NOT tell the user the app is unavailable based on this result alone.`;
  }
  return `No app matching "${app}" was found, and nothing matched "${query}". This is a genuine not-found: no such app exists here. It does NOT mean an app is blocked or withheld by policy. If the user may have misspelled the app, retry once with the corrected name before telling them plainly it is not available.`;
}

/** The leading note ahead of a non-empty result list, when one is due. */
export function searchLeadNote(
  app: string | undefined,
  unscopedFallback: boolean | undefined,
  scopeIgnored: boolean | undefined,
): string {
  if (!app) return "";
  // An unscoped retry served these results: the named app is unknown here,
  // and every match below belongs to some OTHER app. Say so first, or the
  // model would present another app's action as the named app's.
  if (unscopedFallback) {
    return `NOTE: no app matching "${app}" exists here — the matches below are from OTHER apps that could do the task. If the user may have misspelled the app, retry once with the corrected name; otherwise use these only if they genuinely fit, and be plain with the user about which app would be used.\n\n`;
  }
  if (scopeIgnored) {
    return `NOTE: this Houston deployment could not scope the search to "${app}", so the matches below may include OTHER apps' actions. Only use an action whose app matches the one the user named — never attribute another app's action to "${app}", and never conclude "${app}" lacks an action from this list alone.\n\n`;
  }
  return "";
}
