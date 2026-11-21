import type { SlackConnectReturn } from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { gatewayRefusedLoopback } from "./connect-return";
import type {
  ChannelLink,
  ChannelStatus,
  SlackAuthorization,
  SlackCompletion,
  SlackConnectAnswer,
  WhatsAppLink,
} from "./types";

/**
 * Shows which messaging accounts are connected to the personal assistant.
 *
 * The providers this deployment knows, whether each one is configured, and the
 * connections bound in the caller's active space. Throws on every failure,
 * including the deployments that serve no channels at all (404/501) and one
 * whose provider is not configured (503) — the surface reads those three as
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
 * @param returnTo Omit it to return to the web app. `app` returns through the
 *   `houston://` deep link into an installed app; `loopback` redirects to the
 *   desktop shell's listener on `127.0.0.1:<port>`, which waits for `state`.
 *   Either way the ticket reaches the app that will redeem it. When the
 *   gateway refuses `loopback`, the connect asks once more for `app`;
 *   `accepted` says which return the answer's URL leads back to.
 * @assistant group:channels
 * @assistant hidden: answers with an authorization URL that only the person's own browser may open, and whoever finishes in Slack is who the connection would be offered to.
 */
export async function connectSlack(
  scope: HttpScope,
  returnTo?: SlackConnectReturn,
  signal?: AbortSignal,
): Promise<SlackConnectAnswer> {
  let res: Response;
  try {
    res = await httpRequest(scope, "/v1/channels/slack/connect", {
      method: "POST",
      body: JSON.stringify({
        return: returnTo?.kind,
        port: returnTo?.port,
        state: returnTo?.state,
      }),
      signal,
    });
  } catch (error) {
    if (!gatewayRefusedLoopback(returnTo, error, signal)) throw error;
    return connectSlack(scope, { kind: "app" }, signal);
  }
  const { url } = (await res.json()) as SlackAuthorization;
  return { url, accepted: returnTo?.kind ?? null };
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
 * Creates the expiring code that pairs a WhatsApp account with the assistant.
 *
 * The person sends the prefilled command to Houston's WhatsApp number. The
 * returned URL opens that message in WhatsApp.
 * @assistant group:channels
 * @assistant hidden: the code IS the credential for the pairing window, so anyone it reaches can bind their own WhatsApp account to this person's assistant.
 */
export async function linkWhatsApp(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<WhatsAppLink> {
  const res = await httpRequest(scope, "/v1/channels/whatsapp/link", {
    method: "POST",
    body: JSON.stringify({}),
    signal,
  });
  return (await res.json()) as WhatsAppLink;
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
 * account immediately; reconnecting means pairing that account again.
 * @param connectionId The connection this acts on, by the id getChannels
 *   returns. An account label is not its id, so read the id from getChannels
 *   first.
 * @assistant group:channels
 * @assistant confirm: outward. It cuts the person's messaging account off from their assistant, and conversations there stop being answered.
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
