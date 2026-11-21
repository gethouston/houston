import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { reconnectQueued, recordConnection } from "../interaction";
import {
  reconnectCardMarker,
  reconnectOfferedBefore,
  rememberReconnectOffered,
} from "./integrations-reconnect-once";

const GOOGLE_SCOPE =
  /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i;
const SLACK_SCOPE = /\bmissing_scope\b/;

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

export type ScopeReconnect = "card" | "integrations_page" | "offered_before";

export function offerScopeReconnect(
  toolkit: string,
  known: boolean,
  ctx: ExtensionContext | undefined,
): ScopeReconnect {
  if (reconnectQueued(toolkit)) return "card";
  if (reconnectOfferedBefore(toolkit, ctx)) return "offered_before";
  if (!known) return "integrations_page";
  recordConnection({ toolkit, refusedAt: new Date().toISOString() });
  rememberReconnectOffered(toolkit);
  return "card";
}

export function missingPermissionHint(
  reason: string,
  action: string,
  app: string,
  offerReconnect: () => ScopeReconnect,
): string {
  if (GOOGLE_SCOPE.test(reason)) {
    if (NEVER_GRANTED_ACTIONS.has(action.toUpperCase()))
      return ` The user's connection to this app can never include the permission this action needs, and reconnecting the app will not add it. Do not retry this action and do not ask the user to reconnect. ${MANUAL_STEPS} (for example, creating a Gmail filter in Gmail's settings).${NO_TECH}`;
    const route = offerReconnect();
    if (route === "offered_before")
      return ` The user's ${app} connection still lacks a permission this action needs, even though a reconnect was already offered. Do not retry this action and do not ask for another reconnect. ${MANUAL_STEPS}.${NO_TECH}`;
    const head = ` The user's ${app} connection is missing a permission this action needs, usually because a permission box was left unticked when they connected it.`;
    const tail = ` Do not retry this action until they reconnect; other ${app} actions may still work, so finish any part of the task that does not need this one, then end your turn.${NO_TECH}`;
    if (route === "card")
      return `${head} ${reconnectCardMarker(app)} to the interaction card the user sees in place of the chat input. Tell the user in plain words to reconnect the app and tick every permission box on the sign-in screen. You get a message automatically once it is reconnected.${tail}`;
    return `${head} Do not ask to connect it in chat. Tell the user in plain words to reconnect this app on Houston's Integrations page (remove it there, connect it again, and tick every permission box on the sign-in screen).${tail}`;
  }
  if (SLACK_SCOPE.test(reason))
    return ` The user's connection to this app is missing a permission this action needs, usually because it was connected before the app asked for that permission. Ask the user to reconnect the app in Integrations: disconnect it, connect it again, and tick every permission box on the sign-in screen. Do not call request_connection, because the app already shows as connected. After they confirm, retry this action once. If it fails the same way again, do not ask for another reconnect: ${MANUAL_STEPS}.${NO_TECH}`;
  return "";
}
