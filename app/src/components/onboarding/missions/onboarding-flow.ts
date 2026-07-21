import type {
  Capabilities,
  IntegrationConnection,
} from "@houston-ai/engine-client";
// `.ts` extension so the node test runner (extensionless ESM can't resolve)
// can import this pure helper directly, matching the repo's tested-module
// convention. The target only imports erased package types, so it loads clean.
import { INTEGRATION_PROVIDER } from "../../integrations/model.ts";
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
 * Which top-level screen the first-run gate should render (HOU-732).
 *
 * `isFirstRun` reports first-run from a zero-agent workspace and so cannot tell
 * a never-onboarded install apart from one whose agents were all deleted (or a
 * user who just finished the cloud-migration wizard with zero cloud agents).
 * The durable `onboarding_completed` flag closes that gap: once set, a first-run
 * signal is treated as an emptied workspace, and the user stays in the app.
 *
 * - `"segment"` — the segmentation question that precedes the create flow. Only
 *   on a genuine, uncompleted first run that isn't an interrupted-onboarding
 *   resume, and only until the segment has been answered.
 * - `"onboarding"` — the create-your-assistant flow: a fresh uncompleted first
 *   run, or a resume of one interrupted mid-flight (`onboarding_pending`).
 * - `"app"` — everything else (returning users, emptied workspaces, and any
 *   deployment where the user can't create agents).
 *
 * Pure so the four gating behaviors are unit-testable without a live host.
 */
export function onboardingRoute(opts: {
  /** Zero-agent (v3) / zero-workspace (legacy) first-run signal. */
  firstRun: boolean;
  /** Interrupted first-run onboarding is mid-flight (`onboarding_pending`). */
  onboardingPending: boolean;
  /** This install has finished onboarding before (`onboarding_completed`). */
  onboardingCompleted: boolean;
  /** Deployment lets this user create agents (single-player / owner-admin). */
  canCreateAgents: boolean;
  /** Capability fetch failed — fail closed into the shell, never onboarding. */
  capabilitiesError: boolean;
  /** The segmentation question has resolved with a saved answer. */
  segmentAnswered: boolean;
}): "segment" | "onboarding" | "app" {
  if (!opts.canCreateAgents || opts.capabilitiesError) return "app";
  // A genuine first run only if this install hasn't completed onboarding — a
  // completed user with zero agents emptied their workspace, they didn't reset.
  const firstRunOnboarding = opts.firstRun && !opts.onboardingCompleted;
  if (firstRunOnboarding && !opts.onboardingPending && !opts.segmentAnswered) {
    return "segment";
  }
  if (firstRunOnboarding || opts.onboardingPending) return "onboarding";
  return "app";
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
  return capabilities?.integrations?.includes(INTEGRATION_PROVIDER) ?? false;
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
