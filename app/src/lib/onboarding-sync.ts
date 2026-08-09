// Client for the gateway's onboarding-survey store, and the survey's gateway
// front door: consumers import the record shape + merge rules from here too.
//
// ── CONTRACT (server side in cloud/, `internal/edge/me_routes.go`) ──
//   GET  {gateway}/v1/me/onboarding → 200 {@link GatewayOnboardingRecord}
//   PUT  {gateway}/v1/me/onboarding, body = a NON-EMPTY subset of
//        { segment, industry, automationGoal, goalSkipped }; each provided
//        field stamps its `*_answered_at`. 400 on an unknown id / empty body.
//   Auth: the caller's GCIP user bearer, like `GET/PUT /v1/me/profile`.
//   Scope: the USER, never a space — so both calls opt out of the
//   `x-houston-org` pin (`orgScoped: false`). The gateway resolves that pin
//   before the handler and derives its write gate from it, so a plain member
//   of an expired team would eat a silent 403 on their own answers and burn
//   the once-per-account catch-up on it.
// ───────────────────────────────────────────────────────────────────
//
// The survey is answered on ONE device but belongs to the account, so the
// gateway copy is what a second device (and the growth team's export) reads.
// It is a MIRROR, never a gate: every call degrades to "no record" / "not
// synced" and the engine preference keeps carrying the answer. Transport,
// auth and the update floor are the shared `./gateway-fetch` helper's job.

import {
  type GatewayFetchDeps,
  gatewayFetch,
  liveGatewayDeps,
} from "./gateway-fetch.ts";
import {
  type GatewayOnboardingRecord,
  type OnboardingSyncPatch,
  parseGatewayOnboarding,
  sanitizeOnboardingPatch,
} from "./onboarding-gateway-record.ts";

export type { GatewayFetchDeps } from "./gateway-fetch.ts";
export {
  type GatewayOnboardingRecord,
  mergeGatewayOnboarding,
  type OnboardingSyncPatch,
  onboardingPatchFromSurvey,
  owesGatewayCatchUp,
  parseGatewayOnboarding,
  sanitizeOnboardingPatch,
} from "./onboarding-gateway-record.ts";

const ROUTE = "/v1/me/onboarding";

function warn(message: string): void {
  console.warn(`[onboarding-sync] ${message}`);
}

export async function requestGatewayOnboarding(
  deps: GatewayFetchDeps,
): Promise<GatewayOnboardingRecord | null> {
  try {
    const res = await gatewayFetch(deps, ROUTE, {
      method: "GET",
      orgScoped: false,
    });
    if (!res) return null;
    if (!res.ok) {
      warn(`read failed (HTTP ${res.status})`);
      return null;
    }
    return parseGatewayOnboarding(await res.json());
  } catch (e) {
    warn(`read failed: ${e}`);
    return null;
  }
}

export async function putGatewayOnboarding(
  deps: GatewayFetchDeps,
  patch: OnboardingSyncPatch,
): Promise<boolean> {
  const body = sanitizeOnboardingPatch(patch, warn);
  if (!body) return false;
  try {
    const res = await gatewayFetch(deps, ROUTE, {
      method: "PUT",
      orgScoped: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res) return false;
    if (!res.ok) {
      warn(`write failed (HTTP ${res.status})`);
      return false;
    }
    return true;
  } catch (e) {
    warn(`write failed: ${e}`);
    return false;
  }
}

/**
 * Whether this deployment HAS an onboarding store to sync with: the desktop
 * only when its engine is the hosted gateway (a local sidecar serves no
 * `/v1/me/*`), the web always (it is gateway-fronted by construction). Same
 * rule as `accountDeletionAvailable`. Callers gate on this to avoid a
 * guaranteed-404 round trip; the two live wrappers below stay safe regardless.
 */
export function onboardingGatewayAvailable(input: {
  hostedGateway: boolean;
  isTauri: boolean;
}): boolean {
  return input.hostedGateway || !input.isTauri;
}

/** The account's stored survey, or null on ANY failure (offline, signed out,
 *  no gateway, a host that predates the route). */
export function fetchGatewayOnboarding(): Promise<GatewayOnboardingRecord | null> {
  const deps = liveGatewayDeps();
  return deps ? requestGatewayOnboarding(deps) : Promise.resolve(null);
}

/** Push answers to the account store. `false` = not stored (retried later). */
export function syncOnboardingToGateway(
  patch: OnboardingSyncPatch,
): Promise<boolean> {
  const deps = liveGatewayDeps();
  return deps ? putGatewayOnboarding(deps, patch) : Promise.resolve(false);
}
