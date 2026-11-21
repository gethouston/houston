import agentOnboardingEn from "../../locales/en/agent-onboarding.json";
import agentOnboardingEs from "../../locales/es/agent-onboarding.json";
import agentOnboardingPt from "../../locales/pt/agent-onboarding.json";
import { roleLabelIndex } from "./employee-metal-pattern";

export const EMPLOYEE_ROLE_INDEX = roleLabelIndex([
  agentOnboardingEn.roleSetup.roles,
  agentOnboardingEs.roleSetup.roles,
  agentOnboardingPt.roleSetup.roles,
]);
