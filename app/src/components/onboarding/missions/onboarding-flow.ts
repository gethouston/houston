import type {
  Capabilities,
  IntegrationConnection,
} from "@houston-ai/engine-client";
// `.ts` extension so the node test runner (extensionless ESM can't resolve)
// can import this pure helper directly, matching the repo's tested-module
// convention. The target only imports erased package types, so it loads clean.
import type { OnboardingStep } from "../tutorial-copy";

/**
 * Pure routing + matching helpers for the first-run flow, extracted so the
 * engine-gating decision and the connected-toolkit check are unit-testable
 * without a live host (HOU-653).
 *
 * The email steps (connect an inbox, watch the agent send one real email) only
 * work where the deployment actually serves the integrations routes: the new
 * TypeScript engine (desktop host + cloud gateway) advertises the provider in
 * `capabilities.integrations`; the legacy Rust engine advertises no
 * capabilities at all (the query is disabled → `null`). So we gate the email
 * detour on the provider being present and degrade to today's slim finish
 * everywhere else.
 */

/**
 * Whether this boot is a first run that should enter onboarding (HOU-653).
 *
 * The legacy Rust wire signals first-run with ZERO WORKSPACES. The v3 control
 * plane can't: it has no workspace CRUD (single personal workspace,
 * auto-provisioned server-side), so the engine adapter always reports exactly
 * one synthetic workspace and a workspace-count gate never fires — which is
 * how onboarding silently vanished on the TS engine and the cloud gateway.
 * There the honest signal is ZERO AGENTS in that one workspace.
 */
export function isFirstRun(opts: {
  /** New-engine build (v3 host / cloud gateway) vs the legacy Rust wire. */
  controlPlane: boolean;
  workspaceCount: number;
  agentCount: number;
}): boolean {
  return opts.controlPlane ? opts.agentCount === 0 : opts.workspaceCount === 0;
}

/**
 * Whether this deployment can run the email-connect detour: the integrations
 * provider we drive (`composio`) is advertised. Null capabilities (legacy Rust
 * engine, or still loading) read as unavailable — never guess a route the host
 * can't serve.
 */
export function integrationsAvailable(
  capabilities: Capabilities | null | undefined,
): boolean {
  // ANY wired provider (platform or an MCP app hub) can connect email.
  return (capabilities?.integrations?.length ?? 0) > 0;
}

/**
 * Where "Continue" on the AI-connected screen goes (the assistant is already
 * provisioned silently by then): into the email detour when integrations are
 * available, straight to the finish line otherwise.
 */
export function stepAfterAgentCreated(
  capabilities: Capabilities | null | undefined,
): OnboardingStep {
  return integrationsAvailable(capabilities) ? "connectEmail" : "finished";
}

/**
 * Whether the connect-email screen should offer its "skip for now" escape
 * hatch. Always available (a confirm dialog is the actual friction, see
 * `ConnectEmailMission`) except while a connect flow is in flight — the OAuth
 * hop + poll owns the screen until it resolves.
 */
export function shouldOfferConnectSkip(opts: {
  /** A connect flow (OAuth hop + poll) is currently in flight. */
  connecting: boolean;
}): boolean {
  return !opts.connecting;
}

/**
 * Whether the finish screen offers the "Invite your team" growth card. Only on
 * a deployment that serves C8 Spaces (self-serve team creation) — desktop /
 * self-host / legacy hosts have no team to create, so the card would dead-end.
 * A cosmetic feature-detect; the gateway is the sole enforcer.
 */
export function shouldOfferTeamInvite(
  capabilities: Capabilities | null | undefined,
): boolean {
  return capabilities?.spaces === true;
}

/**
 * True once the chosen email toolkit shows up as an ACTIVE connection. A
 * pending or errored connection does NOT count — the user must finish the app's
 * OAuth before the flow advances. Pure so the match rule is unit-tested apart
 * from the query wiring.
 */
export function isToolkitConnected(
  connections: IntegrationConnection[] | undefined,
  toolkit: string,
): boolean {
  return (connections ?? []).some(
    (c) => c.toolkit === toolkit && c.status === "active",
  );
}
