/**
 * The channels REST calls, over the injected `fetch`.
 *
 * These are HOSTED-GATEWAY routes: a messaging connection belongs to the
 * managed cloud (it is the gateway that holds the Slack app's credentials and
 * receives its events), so no host serves them and the runtime client has no
 * surface for them. They go straight through {@link httpRequest} with literal
 * paths, which is also what keeps them visible to the assistant's catalog.
 *
 * Nothing here degrades. A non-2xx throws a `ChannelsHttpError` (`index.ts`)
 * carrying the HTTP `status`, and the surface decides what a 404/501/503 means
 * for its screen — a deployment with no Slack app is a state to render, not an
 * error to report.
 */

import { type HttpScope, httpRequest } from "../http";
import type {
  ChannelLink,
  ChannelStatus,
  SlackAuthorization,
  SlackCompletion,
} from "./types";

/**
 * Shows which messaging accounts are connected to the personal assistant.
 *
 * The providers this deployment knows, whether each one is configured, and the
 * connections bound in the caller's active space. Throws on every failure,
 * including the deployments that serve no channels at all (404/501) and one
 * whose Slack app is not configured (503) — the surface reads those three as
 * "nothing to connect here" and renders the section accordingly.
 * @assistant group:channels
 */
export async function getChannels(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<ChannelStatus> {
  const res = await httpRequest(scope, "/v1/channels", { signal });
  return (await res.json()) as ChannelStatus;
}

/**
 * Starts connecting a Slack workspace to the personal assistant.
 *
 * Begin the Slack OAuth install for the active space. Returns Slack's own
 * hosted authorization `{url}`, which the person's browser opens; nothing is
 * bound until they come back and the ticket is redeemed by completeSlack.
 * @assistant group:channels
 * @assistant hidden: answers with an authorization URL that only the person's own browser may open, and whoever finishes in Slack is who the connection would be offered to.
 */
export async function connectSlack(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<SlackAuthorization> {
  const res = await httpRequest(scope, "/v1/channels/slack/connect", {
    method: "POST",
    body: JSON.stringify({}),
    signal,
  });
  return (await res.json()) as SlackAuthorization;
}

/**
 * Creates the expiring code that pairs an already-installed Slack workspace.
 *
 * Mint a short-lived connection code for a workspace where the Slack app is
 * already installed: the person sends it to the assistant in Slack and that
 * binds the account. Returns the code and when it expires.
 * @assistant group:channels
 * @assistant hidden: the code IS the credential for the pairing window, so anyone it reaches can bind their own Slack account to this person's assistant.
 */
export async function linkSlack(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<ChannelLink> {
  const res = await httpRequest(scope, "/v1/channels/slack/link", {
    method: "POST",
    body: JSON.stringify({}),
    signal,
  });
  return (await res.json()) as ChannelLink;
}

/**
 * Finishes a Slack connection the person just approved in their browser.
 *
 * Bind the connection Slack approved to the signed-in user. The OAuth callback
 * proves only that SOMEONE finished in Slack, so the gateway hands the browser
 * a ticket and binds nothing until this authenticated call redeems it. Single
 * use: a second redemption is a 404 like any stranger's.
 * @param ticket The one-time ticket the Slack callback returned with.
 * @assistant group:channels
 * @assistant hidden: redeems a one-time bearer ticket that only the browser returning from Slack holds, and passing one through a chat turn is how it leaks.
 */
export async function completeSlack(
  scope: HttpScope,
  ticket: string,
  signal?: AbortSignal,
): Promise<SlackCompletion> {
  const res = await httpRequest(scope, "/v1/channels/slack/complete", {
    method: "POST",
    body: JSON.stringify({ ticket }),
    signal,
  });
  return (await res.json()) as SlackCompletion;
}

/**
 * Disconnects a messaging account from the personal assistant.
 *
 * Remove one connection. The assistant stops reading and answering in that
 * account immediately; reconnecting means going through Slack again.
 * @param connectionId The connection this acts on, by the id getChannels
 *   returns. An account label is not its id, so read the id from getChannels
 *   first.
 * @assistant group:channels
 * @assistant confirm: outward. It cuts the person's Slack workspace off from their assistant, and every conversation they were having there stops being answered.
 */
export async function disconnectChannel(
  scope: HttpScope,
  connectionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/channels/connections/${encodeURIComponent(connectionId)}`,
    { method: "DELETE", signal },
  );
}
