import type { Capabilities, CustomIntegrationScope } from "@houston/protocol";

/**
 * Where custom integrations live for this deployment (PRODUCT-1773). A single
 * host (desktop, self-host) keeps ONE definitions file every agent shares;
 * the hosted gateway runs one pod per agent, so a custom integration set up
 * with one agent is that agent's alone — its definition and its vault secret
 * both live on that pod. A host that predates the flag is a shared host.
 */
export function customIntegrationScope(
  capabilities: Pick<Capabilities, "customIntegrationScope"> | null,
): CustomIntegrationScope {
  return capabilities?.customIntegrationScope ?? "host";
}

export interface CustomTransportChoice {
  scope: CustomIntegrationScope;
  /** Every agent the user can see, in sidebar order. */
  agentIds: readonly string[];
  /** The agent whose custom-integration setup chat is OPEN, if any. */
  setupAgentId: string | null;
  /** The agent the user picked on the Integrations page, if any. */
  pickedAgentId: string | null;
  /** The agent selected in the sidebar (the one the user was just in). */
  currentAgentId: string | null;
}

/**
 * The agent whose per-agent custom routes an agent-less surface rides. On a
 * shared host any agent returns the same list, so the first one does. On a
 * per-agent deployment the choice IS the list, in this order:
 *
 *  1. the agent whose setup chat is open — the chat registers the
 *     integration on THAT pod, so the list must read the same pod or the
 *     user watches a row land nowhere (the PRODUCT-1773 report); this beats
 *     a prior pick because the Continue-setup banner reopens a chat on
 *     whichever agent owns the draft;
 *  2. the user's pick on the page;
 *  3. the sidebar's current agent — the one they were just talking to;
 *  4. the first agent.
 *
 * An id naming an agent that no longer exists (deleted, space switch) falls
 * through like no choice.
 */
export function resolveCustomTransportAgent(
  choice: CustomTransportChoice,
): string | undefined {
  const { agentIds } = choice;
  if (choice.scope === "host") return agentIds[0];
  const known = (id: string | null) =>
    id !== null && agentIds.includes(id) ? id : undefined;
  return (
    known(choice.setupAgentId) ??
    known(choice.pickedAgentId) ??
    known(choice.currentAgentId) ??
    agentIds[0]
  );
}
