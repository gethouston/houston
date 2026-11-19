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
    return `Nothing matched "${query}", and this Houston deployment could not verify the app scope "${app}" - so this result proves NOTHING about whether that app exists or what it can do. Retry once with different wording (or the app's exact name), and do NOT tell the user the app is unavailable based on this result alone.`;
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
    return `NOTE: no app matching "${app}" exists here - the matches below are from OTHER apps that could do the task. If the user may have misspelled the app, retry once with the corrected name; otherwise use these only if they genuinely fit, and be plain with the user about which app would be used.\n\n`;
  }
  if (scopeIgnored) {
    return `NOTE: this Houston deployment could not scope the search to "${app}", so the matches below may include OTHER apps' actions. Only use an action whose app matches the one the user named - never attribute another app's action to "${app}", and never conclude "${app}" lacks an action from this list alone.\n\n`;
  }
  return "";
}

/**
 * Gmail actions whose Gmail API method accepts ONLY gmail.settings.basic (or
 * gmail.settings.sharing). Composio's managed Gmail app never requests those
 * Restricted scopes, so no reconnect can grant them. Settings READS also accept
 * https://mail.google.com/, which the app does request, so they stay out.
 */
const NEVER_GRANTED_ACTIONS = new Set([
  "GMAIL_CREATE_FILTER",
  "GMAIL_DELETE_FILTER",
  "GMAIL_UPDATE_VACATION_SETTINGS",
  "GMAIL_UPDATE_IMAP_SETTINGS",
  "GMAIL_UPDATE_POP_SETTINGS",
  "GMAIL_UPDATE_LANGUAGE_SETTINGS",
  "GMAIL_PATCH_SEND_AS",
  "GMAIL_UPDATE_SEND_AS",
]);

/**
 * The app refused because the connection lacks a permission the action needs:
 * Google's ACCESS_TOKEN_SCOPE_INSUFFICIENT or Slack's missing_scope. For the
 * actions above no reconnect helps. Anywhere else one usually does: Google lets
 * the person untick permission boxes at sign-in, and a Slack connection made
 * before the app requested a scope lacks it (Slack's consent is all-or-nothing,
 * so a fresh connection carries every scope the app asks for). The connect card
 * cannot reconnect an app that already shows as connected, so the person does it
 * in Integrations.
 */
export function missingPermissionHint(reason: string, action: string): string {
  if (
    !/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|\bmissing_scope\b/i.test(
      reason,
    )
  )
    return "";
  if (NEVER_GRANTED_ACTIONS.has(action.toUpperCase()))
    return " The user's connection to this app can never include the permission this action needs, and reconnecting the app will not add it. Do not retry this action and do not ask the user to reconnect. Tell the user plainly that this step can't be done in their app from here, and offer to walk them through doing it themselves in the app (for example, creating a Gmail filter in Gmail's settings). Never mention permissions, scopes, codes, or other technical details to the user.";
  return " The user's connection to this app is missing a permission this action needs, usually because a permission box was left unticked when they connected it. Ask the user to reconnect the app in Integrations: disconnect it, connect it again, and tick every permission box on the sign-in screen. Do not call request_connection, because the app already shows as connected. After they confirm, retry this action once. If it fails the same way again, do not ask for another reconnect: tell the user plainly that this step can't be done from here and offer to walk them through doing it themselves in the app. Never mention permissions, scopes, codes, or other technical details to the user.";
}

export function parameterFailureHint(reason: string, action: string): string {
  if (
    /connected account|not connected/i.test(reason) ||
    !/invalid request data provided|following fields are missing|input should be|field required|extra inputs are not permitted|value is not a valid|unsupported[^\n]*\bfield\b/i.test(
      reason,
    )
  )
    return "";
  return ` ${parameterLookupInstruction(action)} Then retry with corrected arguments. Never mention slugs or technical details to the user.`;
}

export function parameterLookupInstruction(action?: string): string {
  return `Call integration_search with \`app\` set to the app the action belongs to (as shown next to it in your earlier search results) and ${action ? `the exact action name "${action}"` : "the exact action name"} as \`query\`; the results then include that action with its parameters described.`;
}

export function parameterFailureError(error: unknown, action: string): unknown {
  if (!(error instanceof Error)) return error;
  const hint = parameterFailureHint(error.message, action);
  return hint ? new Error(error.message + hint, { cause: error }) : error;
}
