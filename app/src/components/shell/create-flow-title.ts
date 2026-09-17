import { useTranslation } from "react-i18next";
import type { CreateFlowStep } from "./create-agent-steps-model";

/**
 * What the create sheet's header calls the screen in hand.
 *
 * A compact step IS its question, so the title says what that screen asks. The
 * wide steps carry their own headline over a catalog, and the flow's own name
 * stays behind as the accessible one — which is also all there is to name on a
 * run the gates left with no screen at all, and never reaches a user: that
 * sheet closes instead of rendering.
 */
export function useCreateFlowTitle(step: CreateFlowStep | null): string {
  const { t } = useTranslation(["shell", "agentOnboarding", "teams"]);
  if (step === "add") return t("shell:addToWorkspace.headline");
  if (step === "choose") return t("shell:newAgent.chooseHeadline");
  if (step === "team") return t("teams:agentTeams.create.title");
  if (step === "customize") {
    return t("agentOnboarding:roleSetup.customize.headline");
  }
  return t("shell:addToWorkspace.title");
}
