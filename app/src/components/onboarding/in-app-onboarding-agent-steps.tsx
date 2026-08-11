import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { tourSelector } from "../shell/workspace-tour-steps.ts";
import { OnboardingCenterCard } from "./onboarding-center-card";
import { TutorialSpotlight } from "./tutorial-spotlight";
import { tutorialSelector } from "./tutorial-targets.ts";
import type { useInAppOnboarding } from "./use-in-app-onboarding";
import { useSetupChecklist } from "./use-setup-checklist";

/**
 * The agent-and-first-task sequences of the in-app onboarding (the steps
 * after the connect sequences): create an agent through the REAL New-agent
 * dialog — coached inside it — then send the agent its first task through the
 * REAL New-task button. In email mode the first task is prewritten and
 * locked; the finale fires when the agent actually sent the email. Split from
 * `in-app-onboarding.tsx` for the file-size cap; same positions model.
 */
export function InAppOnboardingAgentSteps({
  o,
}: {
  o: ReturnType<typeof useInAppOnboarding>;
}) {
  const { t } = useTranslation("setup");
  const checklist = useSetupChecklist(o);
  const namingPhase = useNamingPhase(o.step === "createAgentDialog");

  switch (o.step) {
    case "createAgentIntro":
      return (
        <OnboardingCenterCard
          title={t("inApp.steps.createAgentIntro.title")}
          body={t("inApp.steps.createAgentIntro.body")}
          cta={t("inApp.steps.createAgentIntro.cta")}
          onNext={o.startCreateAgentSpot}
          checklist={checklist}
        />
      );
    case "createAgent":
      return (
        <TutorialSpotlight
          selector={tourSelector("newAgent")}
          title={t("inApp.steps.createAgent.title")}
          hint={t("inApp.steps.createAgent.hint")}
          aside={
            o.arrivedHasAgent ? t("inApp.steps.createAgent.already") : undefined
          }
          asideCta={o.arrivedHasAgent ? t("inApp.skipStep") : undefined}
          onAsideCta={o.arrivedHasAgent ? o.skipCreateAgent : undefined}
        />
      );
    case "createAgentDialog":
      // Coached INSIDE the real dialog (z-lifted, no blockers — the dialog's
      // own modality isolates the app): first the "Create new" tile, then the
      // name + color phase the moment it renders.
      return (
        <TutorialSpotlight
          inDialog
          selector={
            namingPhase
              ? tutorialSelector("createAgentNaming")
              : tutorialSelector("createAgentBlankTile")
          }
          title={
            namingPhase
              ? t("inApp.steps.createAgentDialog.nameTitle")
              : t("inApp.steps.createAgentDialog.pickTitle")
          }
          hint={
            namingPhase
              ? t("inApp.steps.createAgentDialog.nameHint")
              : undefined
          }
        />
      );
    case "agentCreated":
      return (
        <OnboardingCenterCard
          title={t("inApp.steps.agentCreated.title")}
          body={t("inApp.steps.agentCreated.body")}
          cta={t("inApp.continue")}
          onNext={o.startSendMissionIntro}
          checklist={checklist}
        />
      );
    case "sendMissionIntro":
      return (
        <OnboardingCenterCard
          title={t("inApp.steps.sendMissionIntro.title")}
          body={t("inApp.steps.sendMissionIntro.body")}
          cta={t("inApp.steps.sendMissionIntro.cta")}
          onNext={o.startSendMissionSpot}
          checklist={checklist}
        />
      );
    case "sendMission":
      // The hole follows the user's own progress: the New task button first;
      // the moment THEIR click opens the composer panel (`userPanelOpen` — a
      // lingering panel is closed first, so the lesson's click is never
      // skipped), the panel. In email mode the composer arrives prewritten
      // and locked, and the hole narrows to the SEND BUTTON alone — the rest
      // of the panel (close, composer, pickers) stays blocked, and the cues
      // point at exactly the control to press.
      return (
        <TutorialSpotlight
          selector={
            o.userPanelOpen
              ? o.emailMode
                ? '[data-testid="mission-panel"] button[type="submit"]'
                : '[data-testid="mission-panel"]'
              : `[data-screen-active='true'] ${tourSelector("newMission")}`
          }
          title={
            o.userPanelOpen
              ? t(
                  o.emailMode
                    ? "inApp.steps.sendMission.sendTitle"
                    : "inApp.steps.sendMission.typeTitle",
                )
              : t("inApp.steps.sendMission.title")
          }
          hint={
            o.userPanelOpen
              ? t(
                  o.emailMode
                    ? "inApp.steps.sendMission.sendHint"
                    : "inApp.steps.sendMission.typeHint",
                )
              : t(
                  o.emailMode
                    ? "inApp.steps.sendMission.emailHint"
                    : "inApp.steps.sendMission.hint",
                )
          }
        />
      );
    case "emailSending":
      // Watch-only: the agent is working, nothing to click.
      return (
        <TutorialSpotlight
          selector='[data-testid="mission-panel"]'
          title={t("inApp.steps.emailSending.title")}
          hint={t("inApp.steps.emailSending.hint")}
          showCues={false}
        />
      );
    case "emailSent":
      return (
        <OnboardingCenterCard
          title={t("inApp.steps.emailSent.title")}
          body={t("inApp.steps.emailSent.body")}
          cta={t("inApp.steps.missionSent.cta")}
          onNext={o.finish}
          checklist={checklist}
        />
      );
    // missionSent — the free-text finale.
    default:
      return (
        <OnboardingCenterCard
          title={t("inApp.steps.missionSent.title")}
          body={t("inApp.steps.missionSent.body")}
          cta={t("inApp.steps.missionSent.cta")}
          onNext={o.finish}
          checklist={checklist}
        />
      );
  }
}

/** Whether the dialog's naming phase is on screen (DOM-polled, same cadence
 *  as the spotlight's own measurer — the dialog's internal step is not in any
 *  store, and the anchor's presence IS the truth). */
function useNamingPhase(active: boolean): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!active) {
      setPresent(false);
      return;
    }
    const check = () =>
      setPresent(
        document.querySelector(tutorialSelector("createAgentNaming")) !== null,
      );
    check();
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, [active]);
  return present;
}
