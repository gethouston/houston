import { useTranslation } from "react-i18next";
import { HoustonLogo } from "../shell/experience-card";
import { tourSelector } from "../shell/workspace-tour-steps.ts";
import {
  TutorialCenterCard,
  TutorialSpotlight,
  tutorialSelector,
} from "../tutorial";
import { DrawerSpotlight } from "./in-app-drawer-spotlight";
import {
  sendMissionSelector,
  sendMissionSurface,
} from "./in-app-mobile-targets";
import type { useInAppOnboarding } from "./use-in-app-onboarding";
import { useNamingPhase } from "./use-naming-phase";
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
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.createAgentIntro.title")}
          body={t("inApp.steps.createAgentIntro.body")}
          cta={t("inApp.steps.createAgentIntro.cta")}
          onNext={o.startCreateAgentSpot}
          checklist={checklist}
        />
      );
    case "createAgent":
      return (
        <DrawerSpotlight
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
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.agentCreated.title")}
          body={t("inApp.steps.agentCreated.body")}
          cta={t("inApp.continue")}
          onNext={o.startSendMissionIntro}
          checklist={checklist}
        />
      );
    case "sendMissionIntro":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.sendMissionIntro.title")}
          body={t("inApp.steps.sendMissionIntro.body")}
          cta={t("inApp.steps.sendMissionIntro.cta")}
          onNext={o.startSendMissionSpot}
          checklist={checklist}
        />
      );
    case "sendMission": {
      // The hole follows the user's own progress: the New task control
      // first; the moment THEIR tap opens a composer (the desktop board's
      // panel, or the phone's pushed draft chat — a lingering one is closed
      // first, so the lesson's click is never skipped), that surface. In
      // email mode the composer arrives prewritten and locked, and the hole
      // narrows to the SEND BUTTON alone — the rest stays blocked, and the
      // cues point at exactly the control to press.
      const surface = sendMissionSurface({
        panelOpen: o.userPanelOpen,
        chatOpen: o.userChatOpen,
      });
      const composing = surface !== "button";
      return (
        <TutorialSpotlight
          selector={sendMissionSelector(surface, o.emailMode)}
          title={
            composing
              ? t(
                  o.emailMode
                    ? "inApp.steps.sendMission.sendTitle"
                    : "inApp.steps.sendMission.typeTitle",
                )
              : t("inApp.steps.sendMission.title")
          }
          hint={
            composing
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
    }
    case "emailSending":
      // Watch-only: the agent is working, nothing to click. If it errors or
      // takes too long, the addendum offers the way onward (the task WAS
      // sent) — a watch beat must never be a dead end.
      return (
        <TutorialSpotlight
          selector={sendMissionSelector(
            o.userChatOpen ? "chat" : "panel",
            false,
          )}
          title={t("inApp.steps.emailSending.title")}
          hint={t("inApp.steps.emailSending.hint")}
          aside={o.emailStuck ? t("inApp.steps.emailSending.stuck") : undefined}
          asideCta={o.emailStuck ? t("inApp.skipStep") : undefined}
          onAsideCta={o.emailStuck ? o.abandonEmailWait : undefined}
          showCues={false}
        />
      );
    case "emailSent":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.emailSent.title")}
          body={t("inApp.steps.emailSent.body")}
          cta={t("inApp.steps.missionSent.cta")}
          onNext={o.startAcademyReveal}
          checklist={checklist}
        />
      );
    // missionSent — the free-text finale.
    default:
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.missionSent.title")}
          body={t("inApp.steps.missionSent.body")}
          cta={t("inApp.steps.missionSent.cta")}
          onNext={o.startAcademyReveal}
          checklist={checklist}
        />
      );
  }
}
