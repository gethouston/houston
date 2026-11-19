/**
 * App refusals for a permission the connection lacks: Google's
 * ACCESS_TOKEN_SCOPE_INSUFFICIENT ("insufficient authentication scopes") or
 * Slack's missing_scope. What helps depends on why the permission is missing.
 */

const GOOGLE_SCOPE =
  /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i;
const SLACK_SCOPE = /\bmissing_scope\b/;

/**
 * Gmail actions whose Gmail API method accepts ONLY gmail.settings.basic (or
 * gmail.settings.sharing). Composio's managed Gmail app never requests those
 * Restricted scopes, so no reconnect can grant them. Settings READS
 * (GMAIL_LIST_FILTERS, GMAIL_GET_VACATION_SETTINGS...) and GMAIL_FORWARD_MESSAGE
 * also accept https://mail.google.com/, which the app does request, so a
 * refusal there is an unticked box like any other and they stay out.
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

const NO_TECH =
  " Never mention permissions, scopes, codes, or other technical details to the user.";

const MANUAL_STEPS =
  "Tell the user plainly that this step can't be done in their app from here, and offer to walk them through doing it themselves in the app";

/**
 * The guidance appended to a missing-permission refusal, or "" when the
 * refusal is something else.
 *
 * - A never-grantable Gmail settings write: no reconnect, manual steps.
 * - Any other Google refusal: Google lets the person untick permission boxes at
 *   sign-in, so ONE reconnect usually fixes it. `requestReconnect(toolkit)`
 *   queues the reconnect card and returns false when one was already asked for
 *   that app this session; then the refusal survived a reconnect and only the
 *   manual route is left.
 * - Slack: consent is all-or-nothing, so a connection made before the app
 *   requested a scope lacks it and a fresh connection carries it. The person
 *   reconnects from Integrations, and a repeat refusal falls back to manual.
 */
export function missingPermissionHint(
  reason: string,
  action: string,
  requestReconnect: () => boolean,
): string {
  if (GOOGLE_SCOPE.test(reason)) {
    if (NEVER_GRANTED_ACTIONS.has(action.toUpperCase()))
      return ` The user's connection to this app can never include the permission this action needs, and reconnecting the app will not add it. Do not retry this action and do not ask the user to reconnect. ${MANUAL_STEPS} (for example, creating a Gmail filter in Gmail's settings).${NO_TECH}`;
    if (!requestReconnect())
      return ` The user's connection to this app still lacks a permission this action needs, even though a reconnect was already offered. Do not retry this action and do not ask for another reconnect. ${MANUAL_STEPS}.${NO_TECH}`;
    return ` The user's connection to this app is missing a permission this action needs, usually because a permission box was left unticked when they connected it. A reconnect step for this app was added to the interaction card the user sees in place of the chat input. Tell the user in plain words to reconnect the app and tick every permission box on the sign-in screen. Do not retry this action until they reconnect; other actions on this app may still work, so finish any part of the task that does not need this one, then end your turn. You get a message automatically once it is reconnected.${NO_TECH}`;
  }
  if (SLACK_SCOPE.test(reason))
    return ` The user's connection to this app is missing a permission this action needs, usually because it was connected before the app asked for that permission. Ask the user to reconnect the app in Integrations: disconnect it, connect it again, and tick every permission box on the sign-in screen. Do not call request_connection, because the app already shows as connected. After they confirm, retry this action once. If it fails the same way again, do not ask for another reconnect: ${MANUAL_STEPS}.${NO_TECH}`;
  return "";
}
