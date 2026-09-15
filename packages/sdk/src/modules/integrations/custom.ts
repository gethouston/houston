/**
 * The user-scoped custom-integration routes (`/v1/integrations/custom/*`): the
 * outside apps a user adds themselves from a link — their own API or MCP
 * servers. The Composio-backed catalog of connectable providers is a different
 * family; see `reads.ts`.
 *
 * A non-2xx always throws (`modules/http.ts`), including the 404 a deployment
 * without this surface answers the definitions read with. Whether that 404 is
 * "feature absent" or a real failure is the CALLER's judgement — the web
 * adapter degrades it to an empty section, iOS surfaces it — so it is decided
 * at the surface, never swallowed here.
 *
 * Assistant catalog: this file is the single source of truth for these eight
 * operations, so each carries its own `@assistant` block.
 */

import { type HttpScope, httpRequest } from "../http";
import type {
  AddCustomIntegrationInput,
  CustomDetectResult,
  CustomIntegrationDetails,
  CustomIntegrationView,
  CustomToolInfo,
} from "./custom-types";

/**
 * Lists the outside apps the user added themselves.
 * @assistant group:integrations
 */
export async function customIntegrations(
  scope: HttpScope,
): Promise<CustomIntegrationView[]> {
  const res = await httpRequest(scope, "/v1/integrations/custom/definitions");
  return ((await res.json()) as { items: CustomIntegrationView[] }).items;
}

/**
 * Removes an outside app the user added themselves.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @assistant group:integrations
 * @assistant confirm: irreversible. Every agent loses that app, and setting it up again means pasting its address and credential from scratch.
 */
export async function removeCustomIntegration(
  scope: HttpScope,
  slug: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

/**
 * Renames an outside app the user added themselves, or corrects its website.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @param details The display name and website the card shows.
 * @assistant group:integrations unconfirmed: Corrects the name and website on the card; the connection itself, its address and its credential are untouched.
 */
export async function updateCustomIntegrationDetails(
  scope: HttpScope,
  slug: string,
  details: CustomIntegrationDetails,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}`,
    { method: "PATCH", body: JSON.stringify(details) },
  );
}

/**
 * Saves the secret that finishes setting up an app the user added themselves.
 *
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @param values The credential fields the integration asked for, keyed by
 *   field name.
 * @assistant group:integrations confirm: outward. It hands a secret to a third-party service Houston then acts against on the user's behalf, from every agent that app is on.
 * @assistant hidden: takes a secret; the user pastes the integration's own credential.
 */
export async function submitCustomIntegrationCredential(
  scope: HttpScope,
  slug: string,
  values: Record<string, string>,
): Promise<CustomIntegrationView> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/credential`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
  return (await res.json()) as CustomIntegrationView;
}

/**
 * Starts the browser sign-in for an app the user added themselves.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @assistant group:integrations hidden: starts a browser sign-in only the user can finish.
 */
export async function startCustomIntegrationOAuth(
  scope: HttpScope,
  slug: string,
): Promise<{ authorizeUrl: string }> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/oauth/start`,
    { method: "POST" },
  );
  return (await res.json()) as { authorizeUrl: string };
}

/**
 * Checks what kind of service a link the user pasted points to.
 *
 * @param url The full https address of the service's API description.
 * @assistant group:integrations
 * @assistant confirm: outward. Houston fetches whatever URL it is handed, so a model-supplied address makes Houston's own network reach a stranger's host.
 */
export async function detectCustomIntegration(
  scope: HttpScope,
  url: string,
): Promise<CustomDetectResult> {
  const res = await httpRequest(scope, "/v1/integrations/custom/detect", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return (await res.json()) as CustomDetectResult;
}

/**
 * Adds an outside app of the user's own from a link.
 * @param input The connector to add: where its API description lives and
 *   how it authenticates.
 * @assistant group:integrations
 * @assistant confirm: outward. Houston starts calling an address the user supplied on their behalf, with whatever credential is attached to it.
 * @assistant unschematized: the input's headers is an open record of header name to value.
 */
export async function addCustomIntegration(
  scope: HttpScope,
  input: AddCustomIntegrationInput,
): Promise<CustomIntegrationView> {
  const res = await httpRequest(scope, "/v1/integrations/custom/definitions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as CustomIntegrationView;
}

/**
 * Lists the actions an app the user added themselves offers.
 *
 * The compiled tools behind one custom integration (the detail card's list).
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @assistant group:integrations
 */
export async function customIntegrationTools(
  scope: HttpScope,
  slug: string,
): Promise<CustomToolInfo[]> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/tools`,
  );
  return ((await res.json()) as { items: CustomToolInfo[] }).items;
}
