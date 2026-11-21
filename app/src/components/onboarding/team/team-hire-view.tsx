import { useTranslation } from "react-i18next";
import { ContextStep } from "../../shell/context-step";
import { CustomizeStep } from "../../shell/customize-step";
import { RoleStep } from "../../shell/role-step";
import type { CreateAgentFlow } from "../../shell/use-create-agent-flow";
import type { HireStep } from "./team-view-model";

export function TeamHireView({
  step,
  flow,
  formId,
  onAnswered,
}: {
  step: HireStep;
  flow: CreateAgentFlow;
  formId: string;
  onAnswered: () => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  if (step === "context") {
    return <ContextStep state={flow.roleState} onAnswered={onAnswered} />;
  }
  if (step === "role") {
    return <RoleStep state={flow.roleState} onAnswered={onAnswered} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-balance text-center text-2xl font-normal">
        {t("roleSetup.customize.headline")}
      </h2>
      <CustomizeStep flow={flow} formId={formId} />
    </div>
  );
}
