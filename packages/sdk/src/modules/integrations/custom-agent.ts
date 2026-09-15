/**
 * The per-agent custom-integration routes (HOU-823), on
 * `/agents/{agentSlugOrId}/integrations/custom/*`.
 *
 * Same data set as `custom.ts`, reached through the agent's own pod: a hosted
 * deployment serves ONLY this form (the gateway proxies it to the pod), while a
 * direct host serves both. The definitions read answers 404 where the feature
 * is absent and the tools read answers `{code:"not_found"}` for an unknown
 * slug; both throw here and the surface decides, as everywhere else in this
 * module.
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

/** The agent-scoped root every route below hangs off. */
const customRoot = (agentSlugOrId: string) =>
  `/agents/${encodeURIComponent(agentSlugOrId)}/integrations/custom`;

/**
 * Lists the outside apps added to one agent.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @assistant group:integrations
 */
export async function agentCustomIntegrations(
  scope: HttpScope,
  agentSlugOrId: string,
): Promise<CustomIntegrationView[]> {
  const res = await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions`,
  );
  return ((await res.json()) as { items: CustomIntegrationView[] }).items;
}

/**
 * Lists the actions an outside app added to one agent offers.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param slug The custom integration's exact slug, from
 *   agentCustomIntegrations.
 * @assistant group:integrations
 */
export async function agentCustomIntegrationTools(
  scope: HttpScope,
  agentSlugOrId: string,
  slug: string,
): Promise<CustomToolInfo[]> {
  const res = await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions/${encodeURIComponent(slug)}/tools`,
  );
  return ((await res.json()) as { items: CustomToolInfo[] }).items;
}

/**
 * Adds an outside app of the user's own to one agent, from a link.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param input The connector to add: where its API description lives and
 *   how it authenticates.
 * @assistant group:integrations
 * @assistant confirm: outward. Houston starts calling an address the user supplied on this agent's behalf, with whatever credential is attached to it.
 * @assistant unschematized: the input's headers is an open record of header name to value.
 */
export async function addAgentCustomIntegration(
  scope: HttpScope,
  agentSlugOrId: string,
  input: AddCustomIntegrationInput,
): Promise<CustomIntegrationView> {
  const res = await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return (await res.json()) as CustomIntegrationView;
}

/**
 * Removes an outside app from one agent.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param slug The custom integration's exact slug, from
 *   agentCustomIntegrations.
 * @assistant group:integrations
 * @assistant confirm: irreversible. The agent loses that app, and setting it up again means pasting its address and credential from scratch.
 */
export async function removeAgentCustomIntegration(
  scope: HttpScope,
  agentSlugOrId: string,
  slug: string,
): Promise<void> {
  await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

/**
 * Renames an outside app added to one agent, or corrects its website.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param slug The custom integration's exact slug, from
 *   agentCustomIntegrations.
 * @param details The display name and website the card shows.
 * @assistant group:integrations unconfirmed: Corrects the name and website on the card; the connection itself, its address and its credential are untouched.
 */
export async function updateAgentCustomIntegrationDetails(
  scope: HttpScope,
  agentSlugOrId: string,
  slug: string,
  details: CustomIntegrationDetails,
): Promise<void> {
  await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions/${encodeURIComponent(slug)}`,
    { method: "PATCH", body: JSON.stringify(details) },
  );
}

/**
 * Saves the secret that finishes setting up an app added to one agent.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param slug The custom integration's exact slug, from
 *   agentCustomIntegrations.
 * @param values The credential fields the integration asked for, keyed by
 *   field name.
 * @assistant group:integrations confirm: outward. It hands a secret to a third-party service Houston then acts against on this agent's behalf.
 * @assistant hidden: takes a secret; the user pastes the integration's own credential.
 */
export async function submitAgentCustomIntegrationCredential(
  scope: HttpScope,
  agentSlugOrId: string,
  slug: string,
  values: Record<string, string>,
): Promise<CustomIntegrationView> {
  const res = await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions/${encodeURIComponent(slug)}/credential`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
  return (await res.json()) as CustomIntegrationView;
}

/**
 * Starts the browser sign-in for an app added to one agent.
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param slug The custom integration's exact slug, from
 *   agentCustomIntegrations.
 * @assistant group:integrations hidden: starts a browser sign-in only the user can finish.
 */
export async function startAgentCustomIntegrationOAuth(
  scope: HttpScope,
  agentSlugOrId: string,
  slug: string,
): Promise<{ authorizeUrl: string }> {
  const res = await httpRequest(
    scope,
    `${customRoot(agentSlugOrId)}/definitions/${encodeURIComponent(slug)}/oauth/start`,
    { method: "POST" },
  );
  return (await res.json()) as { authorizeUrl: string };
}

/**
 * Checks what kind of service a link the user pasted points to, from one
 * agent's runtime.
 *
 * @param agentSlugOrId The agent this acts on, by the id listAgents returns.
 *   An agent's name is not its id, so read the id from listAgents first.
 * @param url The full https address of the service's API description.
 * @assistant group:integrations
 * @assistant confirm: outward. Houston fetches whatever URL it is handed, so a model-supplied address makes this agent's own network reach a stranger's host.
 */
export async function detectAgentCustomIntegration(
  scope: HttpScope,
  agentSlugOrId: string,
  url: string,
): Promise<CustomDetectResult> {
  const res = await httpRequest(scope, `${customRoot(agentSlugOrId)}/detect`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return (await res.json()) as CustomDetectResult;
}
