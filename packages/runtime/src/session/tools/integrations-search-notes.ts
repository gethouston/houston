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

export function searchLeadNote(
  app: string | undefined,
  unscopedFallback: boolean | undefined,
  scopeIgnored: boolean | undefined,
): string {
  if (!app) return "";
  if (unscopedFallback) {
    return `NOTE: no app matching "${app}" exists here - the matches below are from OTHER apps that could do the task. If the user may have misspelled the app, retry once with the corrected name; otherwise use these only if they genuinely fit, and be plain with the user about which app would be used.\n\n`;
  }
  if (scopeIgnored) {
    return `NOTE: this Houston deployment could not scope the search to "${app}", so the matches below may include OTHER apps' actions. Only use an action whose app matches the one the user named - never attribute another app's action to "${app}", and never conclude "${app}" lacks an action from this list alone.\n\n`;
  }
  return "";
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
