import type { OnboardingUpdateWire } from "@houston/wire-types";
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
import {
  refusedField,
  unstoredFields,
  withoutField,
} from "./onboarding-gateway-stored.ts";

export type { GatewayFetchDeps } from "./gateway-fetch.ts";
export { owesGatewayCatchUp } from "./onboarding-gateway-catch-up.ts";
export {
  type GatewayOnboardingRecord,
  mergeGatewayOnboarding,
  type OnboardingSyncPatch,
  onboardingPatchFromSurvey,
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
    const res = await put(deps, body);
    if (!res) return false;
    if (res.status === 400) {
      const field = refusedField((await readJson(res))?.code, body);
      const rest = field ? withoutField(body, field) : null;
      if (field) warn(`the gateway cannot store this ${field} yet`);
      if (rest) await stored(await put(deps, rest), rest);
      return false;
    }
    return await stored(res, body);
  } catch (e) {
    warn(`write failed: ${e}`);
    return false;
  }
}

function put(deps: GatewayFetchDeps, patch: OnboardingSyncPatch) {
  const body: OnboardingUpdateWire = patch;
  return gatewayFetch(deps, ROUTE, {
    method: "PUT",
    orgScoped: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function stored(
  res: Response | null,
  sent: OnboardingSyncPatch,
): Promise<boolean> {
  if (!res) return false;
  if (!res.ok) {
    warn(`write failed (HTTP ${res.status})`);
    return false;
  }
  const missing = unstoredFields(
    sent,
    parseGatewayOnboarding(await readJson(res)),
  );
  if (missing.length === 0) return true;
  warn(`the gateway did not store ${missing.join(", ")}`);
  return false;
}

async function readJson(
  res: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await res.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function onboardingGatewayAvailable(input: {
  hostedGateway: boolean;
  isTauri: boolean;
}): boolean {
  return input.hostedGateway || !input.isTauri;
}

export function fetchGatewayOnboarding(): Promise<GatewayOnboardingRecord | null> {
  const deps = liveGatewayDeps();
  return deps ? requestGatewayOnboarding(deps) : Promise.resolve(null);
}

export function syncOnboardingToGateway(
  patch: OnboardingSyncPatch,
): Promise<boolean> {
  const deps = liveGatewayDeps();
  return deps ? putGatewayOnboarding(deps, patch) : Promise.resolve(false);
}
