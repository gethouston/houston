import { useTranslation } from "react-i18next";
import type { LabeledChecklistItem } from "../tutorial";
import { inAppSetupChecklist } from "./in-app-setup-checklist";
import type { useInAppOnboarding } from "./use-in-app-onboarding";

/**
 * The labeled setup checklist for the current step — shared by both step
 * renderers so every center card shows the same list, visibly completing.
 */
export function useSetupChecklist(
  o: ReturnType<typeof useInAppOnboarding>,
): LabeledChecklistItem[] {
  const { t } = useTranslation("setup");
  return inAppSetupChecklist(o.step, {
    integrationsOn: o.integrationsOn,
    canCreateAgents: o.canCreateAgents,
  }).map((item) => ({ ...item, label: t(`inApp.checklist.${item.id}`) }));
}
