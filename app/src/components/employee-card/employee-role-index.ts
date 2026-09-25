import agentOnboardingEn from "../../locales/en/agent-onboarding.json";
import agentOnboardingEs from "../../locales/es/agent-onboarding.json";
import agentOnboardingPt from "../../locales/pt/agent-onboarding.json";
import { roleLabelIndex } from "./employee-metal-pattern";

/** Every shipped language's catalog role labels, for engraving a badge the
 *  same whatever language the role is read in. English first, so a label
 *  shared across languages resolves to its English role. */
export const EMPLOYEE_ROLE_INDEX = roleLabelIndex([
  agentOnboardingEn.roleSetup.roles,
  agentOnboardingEs.roleSetup.roles,
  agentOnboardingPt.roleSetup.roles,
]);
