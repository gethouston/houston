import type { TFunction } from "i18next";
import type {
  CeilingPolicyChip,
  PeoplePolicyChip,
} from "./agent-policy-chips-model";

export function peoplePolicyValue(
  t: TFunction<["teams", "agents"]>,
  value: PeoplePolicyChip,
): string {
  return value.kind === "everyone"
    ? t("teams:teamView.settings.policy.everyone")
    : t("teams:teamView.settings.policy.people", { count: value.n });
}

export function ceilingPolicyValue(
  t: TFunction<["teams", "agents"]>,
  value: CeilingPolicyChip,
  ceiling: "integrations" | "models",
): string | undefined {
  // Nothing to say YET stays blank; nothing we could READ says so. The two
  // must never wear the same face: a row that quietly failed would otherwise
  // look like a row still arriving, forever.
  if (value.kind === "pending") return undefined;
  if (value.kind === "unavailable")
    return t("teams:teamView.settings.policy.unavailable");
  // "All integrations allowed", never a bare "All": the value has to survive
  // being read on its own, one row away from its sibling. The counted halves
  // are per-ceiling too, so es/pt can agree in gender with their noun.
  if (value.kind === "all")
    return t(
      ceiling === "integrations"
        ? "teams:teamView.settings.policy.allIntegrations"
        : "teams:teamView.settings.policy.allModels",
    );
  return t(
    ceiling === "integrations"
      ? "teams:teamView.settings.policy.integrationsAllowed"
      : "teams:teamView.settings.policy.modelsAllowed",
    { count: value.n },
  );
}
