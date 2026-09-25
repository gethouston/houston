// `.ts` extensions so the node test runner can import this pure module
// directly (Node ESM requires them for runtime-value imports).
import type { OnboardingStep } from "../../lib/onboarding-route.ts";
import {
  type ProviderConnectionStatus,
  providerIsConnected,
} from "../../lib/provider-connection.ts";

/** The provider scan as `useProviderStatuses` returns it. */
export interface ProviderStatusScan {
  statuses: Readonly<Record<string, ProviderConnectionStatus>>;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The first CONFIRMED connected provider's id, or null. The same rule every
 * "Connected" surface reads (HOU-979, `confirmedConnectedProviders`): an
 * `unknown` probe is not a connection, and neither is a scan still loading or
 * one whose re-probe failed, whose retained statuses may predate a
 * disconnect.
 */
export function connectedProviderId(scan: ProviderStatusScan): string | null {
  if (scan.isLoading || scan.isError) return null;
  for (const [id, status] of Object.entries(scan.statuses)) {
    if (providerIsConnected(status)) return id;
  }
  return null;
}

/** An onboarding funnel beat the first-run flow reports. */
export type OnboardingBeat =
  | { event: "onboarding_step_viewed"; step: "connectAi" | "team" }
  | { event: "ai_provider_connected"; provider: string };

/**
 * The funnel beats one route change earns. Only the connect and team cards
 * report a step view here (the survey and the team card's own sub-steps fire
 * their own), once per run. Leaving the connect card for the team card means
 * the card saw the connection land, which is the `ai_provider_connected` beat;
 * arriving on the team card with a provider already connected is not.
 */
export function onboardingBeats(args: {
  previous: OnboardingStep | null;
  current: OnboardingStep;
  viewed: ReadonlySet<OnboardingStep>;
  providerId: string | null;
}): OnboardingBeat[] {
  const beats: OnboardingBeat[] = [];
  if (
    args.previous === "connectAi" &&
    args.current === "team" &&
    args.providerId !== null
  ) {
    beats.push({ event: "ai_provider_connected", provider: args.providerId });
  }
  if (
    (args.current === "connectAi" || args.current === "team") &&
    !args.viewed.has(args.current)
  ) {
    beats.push({ event: "onboarding_step_viewed", step: args.current });
  }
  return beats;
}

/**
 * The onboarding screen to put on display for the route's `step`, or null
 * while that screen's inputs still load. The connect card waits for the first
 * provider probe: until it lands the route reads "not connected", and a user
 * who already connected must not flash through the card. The team card waits
 * for the workspace it hires into.
 */
export function shownOnboardingStep(args: {
  step: OnboardingStep;
  surveyLoading: boolean;
  statusesLoading: boolean;
  hasWorkspace: boolean;
}): OnboardingStep | null {
  switch (args.step) {
    case "survey":
      return args.surveyLoading ? null : "survey";
    case "connectAi":
      return args.statusesLoading ? null : "connectAi";
    case "team":
      return args.hasWorkspace ? "team" : null;
  }
}
