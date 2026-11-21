import { useTranslation } from "react-i18next";
import type { CreateFlowStep } from "./create-agent-steps-model";

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
