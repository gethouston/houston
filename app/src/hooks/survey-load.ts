import { isHostedGatewayEngine } from "../lib/engine";
import type { OnboardingSurveyPreference } from "../lib/onboarding-survey";
import { liveSurveyStorePorts } from "../lib/onboarding-survey-ports";
import { loadSurveyPreference } from "../lib/onboarding-survey-store";
import { onboardingGatewayAvailable } from "../lib/onboarding-sync";
import { osIsTauri } from "../lib/os-bridge";

/** The signed-in person's survey record, from wherever this deployment keeps
 *  it (the account store behind a gateway, this device otherwise). */
export function loadOwnSurvey(
  uid: string | null,
): Promise<OnboardingSurveyPreference | null> {
  const gateway = onboardingGatewayAvailable({
    hostedGateway: isHostedGatewayEngine(),
    isTauri: osIsTauri(),
  });
  return loadSurveyPreference(uid, gateway, liveSurveyStorePorts);
}
