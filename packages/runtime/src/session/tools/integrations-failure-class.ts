/**
 * App refusals that no retry can fix. Composio relays a connected app's own
 * refusal as free text in a `successful: false` result, and its
 * `auth_refresh_required` flag stays false even for a revoked token, so the
 * message is the only signal. Left unclassified, the model reads "did not
 * succeed" as transient and repeats the call: one routine re-ran a revoked
 * Apify key 16 times in an hour, another called a Slack feature the workspace
 * does not have every 15 to 30 minutes for two days.
 *
 * Every pattern is anchored on a real refusal body seen in production
 * Composio logs (the tests pin them). A refusal that matches none stays
 * unclassified and keeps today's generic failure text.
 */

export type IntegrationFailureClass =
  /** The saved login or key no longer works: only a reconnect fixes it. */
  | { kind: "needs_reconnect"; toolkit: string }
  /** The account's plan or workspace does not offer this feature at all. */
  | { kind: "not_available"; toolkit: string }
  /** Notion: the page or database is not shared with the integration. */
  | { kind: "not_shared"; toolkit: string };

const NEEDS_RECONNECT: readonly RegExp[] = [
  // Apify: revoked or rotated API token.
  /authentication token is not valid/i,
  // Odoo: deleted API key ("Invalid apikey").
  /\binvalid api ?key\b/i,
  // Facebook / Meta OAuthException 190: password change or session reset.
  /error validating access token/i,
  // Google 401 UNAUTHENTICATED: the refresh token stopped working.
  /request had invalid authentication credentials/i,
  // Google 403: the connection was granted without a scope this action needs.
  /insufficient authentication scopes/i,
  // OAuth refresh refused outright.
  /\binvalid_grant\b/,
  /token has been expired or revoked/i,
  // Slack auth codes.
  /\b(invalid_auth|token_revoked|token_expired|account_inactive)\b/,
];

const NOT_SHARED: readonly RegExp[] = [
  // Notion 404 object_not_found, and Composio's rewording of it.
  /shared with your integration/i,
  /does not contain any data sources accessible by this api bot/i,
];

const NOT_AVAILABLE: readonly RegExp[] = [
  // Slack: the workspace lacks the feature (Real-time Search API) or plan.
  /\bfeature_not_enabled\b/,
  /\bpaid_only\b/,
  // Apollo: "The api/v1/people/match API is not included in your Free plan".
  /\bnot included in your \w+ plan\b/i,
  // Linear: "You've exceeded the free issue limit for this workspace".
  /\bexceeded the free \w+ limit\b/i,
];

export function classifyIntegrationFailure(
  reason: string,
  toolkit: string,
): IntegrationFailureClass | undefined {
  if (NEEDS_RECONNECT.some((p) => p.test(reason)))
    return { kind: "needs_reconnect", toolkit };
  if (NOT_SHARED.some((p) => p.test(reason)))
    return { kind: "not_shared", toolkit };
  if (NOT_AVAILABLE.some((p) => p.test(reason)))
    return { kind: "not_available", toolkit };
  return undefined;
}

/**
 * The toolkit an action belongs to: the one integration_search reported for
 * it, else the slug's first segment (GMAIL_SEND_EMAIL → gmail), which is right
 * for single-word toolkits and only a display fallback for the rest.
 */
export function toolkitForAction(
  action: string,
  known: ReadonlyMap<string, string>,
): string {
  return (
    known.get(action) ?? (action.split("_")[0] ?? action).trim().toLowerCase()
  );
}

/** Slack's search that needs the Real-time Search API on the workspace. */
const SLACK_ASSISTANT_SEARCH = "SLACK_ASSISTANT_SEARCH_CONTEXT";

/**
 * What the model is told for a classified refusal, appended to the failure.
 * Each one says not to retry and names the one way forward.
 */
export function failureClassGuidance(
  failure: IntegrationFailureClass,
  action: string,
): string {
  const app = failure.toolkit;
  switch (failure.kind) {
    case "needs_reconnect":
      return ` The user's ${app} connection no longer works: the app refused the saved sign-in (it expired, was revoked or changed, or lacks a permission this action needs). Retrying cannot fix this, so do not call any ${app} action again until the user reconnects it. A reconnect step for this app was added to the interaction card the user sees in place of the chat input. Tell the user in plain words that this app needs to be reconnected, finish any part of the task that does not need it, then end your turn; you get a message automatically once it is reconnected. Never mention slugs or technical details to the user.`;
    case "not_shared":
      return ` Notion only lets this connection see the pages and databases the user has shared with it, and this one is not shared (or the id does not exist). Do not retry the same id. If the id was guessed or remembered, search Notion for the page and use an id from those results. If the page exists, ask the user to open it in Notion, open the ... menu, choose Connections and add Composio, then continue once they confirm. Never mention ids or technical details to the user.`;
    case "not_available":
      if (app === "slack" && action === SLACK_ASSISTANT_SEARCH)
        return ` This Slack workspace does not have the feature this action needs, so it can never succeed here. Do not call ${SLACK_ASSISTANT_SEARCH} again, in this run or any later one. To search Slack messages, use SLACK_SEARCH_MESSAGES instead (it takes a \`query\`).`;
      return ` The user's ${app} account or plan does not include this feature, so this action can never succeed on it. Do not retry it. Do the task another way if one exists (another ${app} action, or a different app); otherwise tell the user in plain words that their ${app} plan does not include this. Never mention slugs or technical details to the user.`;
  }
}
