import { reconnectCardMarker } from "./integrations-reconnect-once";

export type IntegrationFailureClass =
  | { kind: "needs_reconnect"; toolkit: string }
  | { kind: "not_available"; toolkit: string }
  | { kind: "not_shared"; toolkit: string };

const NEEDS_RECONNECT: readonly RegExp[] = [
  /authentication token is not valid/i,
  /\binvalid api ?key\b/i,
  /error validating access token/i,
  /request had invalid authentication credentials/i,
  /\binvalid_grant\b/,
  /token has been expired or revoked/i,
  /\b(invalid_auth|token_revoked|token_expired|account_inactive)\b/,
];

const NOT_SHARED: readonly RegExp[] = [
  /shared with your integration/i,
  /does not contain any data sources accessible by this api bot/i,
];

const NOT_AVAILABLE: readonly RegExp[] = [
  /\bfeature_not_enabled\b/,
  /\bpaid_only\b/,
  /\bnot included in your \w+ plan\b/i,
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

export function toolkitForAction(
  action: string,
  known: ReadonlyMap<string, string>,
): { toolkit: string; known: boolean } {
  const reported = known.get(action);
  if (reported) return { toolkit: reported, known: true };
  return {
    toolkit: (action.split("_")[0] ?? action).trim().toLowerCase(),
    known: false,
  };
}

export type ReconnectRoute = "card" | "integrations_page";

const SLACK_ASSISTANT_SEARCH = "SLACK_ASSISTANT_SEARCH_CONTEXT";

export function failureClassGuidance(
  failure: IntegrationFailureClass,
  action: string,
  reconnect: ReconnectRoute = "card",
): string {
  const app = failure.toolkit;
  switch (failure.kind) {
    case "needs_reconnect": {
      const head = ` The user's ${app} connection no longer works: the app refused the saved sign-in (it expired, was revoked or changed). Retrying cannot fix this, so do not call any ${app} action again until the user reconnects it.`;
      const tail = " Never mention slugs or technical details to the user.";
      if (reconnect === "card")
        return `${head} ${reconnectCardMarker(app)} to the interaction card the user sees in place of the chat input. Tell the user in plain words that this app needs to be reconnected, finish any part of the task that does not need it, then end your turn; you get a message automatically once it is reconnected.${tail}`;
      return `${head} Do not ask to connect it in chat. Tell the user in plain words to reconnect this app on Houston's Integrations page (remove it there and connect it again), finish any part of the task that does not need it, then end your turn.${tail}`;
    }
    case "not_shared":
      return ` Notion only lets this connection see the pages and databases the user has shared with it, and this one is not shared (or the id does not exist). Do not retry the same id. If the id was guessed or remembered, search Notion for the page and use an id from those results. If the page exists, ask the user to open it in Notion, open the ... menu, choose Connections and add Composio, then continue once they confirm. Never mention ids or technical details to the user.`;
    case "not_available":
      if (app === "slack" && action === SLACK_ASSISTANT_SEARCH)
        return ` This Slack workspace does not have the feature this action needs, so it can never succeed here. Do not call ${SLACK_ASSISTANT_SEARCH} again, in this run or any later one. To search Slack messages, use SLACK_SEARCH_MESSAGES instead (it takes a \`query\`).`;
      return ` The user's ${app} account or plan does not include this feature, so this action can never succeed on it. Do not retry it. Do the task another way if one exists (another ${app} action, or a different app); otherwise tell the user in plain words that their ${app} plan does not include this. Never mention slugs or technical details to the user.`;
  }
}
