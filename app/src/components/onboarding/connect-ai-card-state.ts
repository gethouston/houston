import type { OnboardingStep } from "../../lib/onboarding-route.ts";
import {
  type ProviderConnectionStatus,
  providerIsConnected,
} from "../../lib/provider-connection.ts";

export interface ProviderStatusScan {
  statuses: Readonly<Record<string, ProviderConnectionStatus>>;
  isLoading: boolean;
  isError: boolean;
}

export function connectedProviderId(scan: ProviderStatusScan): string | null {
  if (scan.isLoading || scan.isError) return null;
  for (const [id, status] of Object.entries(scan.statuses)) {
    if (providerIsConnected(status)) return id;
  }
  return null;
}

export type OnboardingBeat =
  | { event: "onboarding_step_viewed"; step: "connectAi" | "team" }
  | { event: "ai_provider_connected"; provider: string };

export function onboardingBeats(args: {
  previous: OnboardingStep | null;
  current: OnboardingStep;
  viewed: ReadonlySet<OnboardingStep>;
  providerId: string | null;
}): OnboardingBeat[] {
  const beats: OnboardingBeat[] = [];
  if (
    args.previous === "connectAi" &&
    args.current !== "connectAi" &&
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
