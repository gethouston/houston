import type {
  GatewayOnboardingRecord,
  OnboardingSyncPatch,
} from "./onboarding-gateway-record.ts";

export function unstoredFields(
  sent: OnboardingSyncPatch,
  stored: GatewayOnboardingRecord | null,
): (keyof OnboardingSyncPatch)[] {
  const keys = Object.keys(sent) as (keyof OnboardingSyncPatch)[];
  if (!stored) return keys;
  return keys.filter((key) => stored[key] !== sent[key]);
}

const FIELD_OF_REFUSAL: Record<string, keyof OnboardingSyncPatch> = {
  invalid_role: "role",
  invalid_company_size: "companySize",
};

export function refusedField(
  code: unknown,
  sent: OnboardingSyncPatch,
): keyof OnboardingSyncPatch | null {
  if (typeof code !== "string") return null;
  const field = FIELD_OF_REFUSAL[code];
  return field !== undefined && field in sent ? field : null;
}

export function withoutField(
  sent: OnboardingSyncPatch,
  field: keyof OnboardingSyncPatch,
): OnboardingSyncPatch | null {
  const rest = { ...sent };
  delete rest[field];
  return Object.keys(rest).length > 0 ? rest : null;
}
