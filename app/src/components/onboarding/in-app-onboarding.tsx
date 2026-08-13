import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useOnboardingPending } from "../../hooks/use-onboarding-pending";
import { SETUP_CHAPTER_EXPERIENCE } from "../../lib/academy/academy-ranks";
import { useUIStore } from "../../stores/ui";
import { HoustonLogo } from "../shell/experience-card";
import { tourSelector } from "../shell/workspace-tour-steps.ts";
import {
  TutorialCenterCard,
  TutorialSpotlight,
  tutorialSelector,
} from "../tutorial";
import { InAppOnboardingAgentSteps } from "./in-app-onboarding-agent-steps";
import { useInAppOnboarding } from "./use-in-app-onboarding";
import { useSetupChecklist } from "./use-setup-checklist";

/**
 * The in-app onboarding: a game-style tutorial over the REAL app, in two
 * positions. The WHAT — narration — speaks from a centered card with its own
 * button ({@link TutorialCenterCard}); the HOW — the action — is a chip
 * pinned where the action happens ({@link TutorialSpotlight}). All wiring —
 * signals, the step machine, provisioning, confetti, analytics — lives in
 * {@link useInAppOnboarding}; this file only renders the current step.
 *
 * Sequences: welcome → connect your AI (intro, sidebar spot, hub spot,
 * celebration) → connect your apps (same shape; only where the deployment
 * serves Composio) → create an agent (intro, New-agent spot, celebration;
 * only for callers who may create) → send it its first task (intro, New-task
 * spot, finale) — the last two rendered by {@link InAppOnboardingAgentSteps} —
 * and, whichever path got here, the Academy reveal that closes the run.
 * EVERY user walks every step with its full teaching; a goal already met on
 * arrival gets an addendum under a hairline with a skip button, never a
 * replaced or skipped step.
 */
export function InAppOnboarding() {
  const { t } = useTranslation("setup");
  const o = useInAppOnboarding();
  const checklist = useSetupChecklist(o);

  switch (o.step) {
    case "welcome":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.welcomeTitle")}
          body={
            <Trans
              t={t}
              i18nKey="inApp.welcomeBody"
              components={{ emph: <strong className="font-medium text-ink" /> }}
            />
          }
          cta={t("inApp.welcomeCta")}
          onNext={o.startAiIntro}
          checklist={checklist}
        />
      );
    case "connectAiIntro":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.connectAiIntro.title")}
          body={t("inApp.steps.connectAiIntro.body")}
          cta={t("inApp.steps.connectAiIntro.cta")}
          onNext={o.startAiSpot}
          checklist={checklist}
        />
      );
    case "openAiHub":
      return (
        <TutorialSpotlight
          selector={tourSelector("nav-ai-hub")}
          title={t("inApp.steps.openAiHub.title")}
        />
      );
    case "connectAi":
      return (
        <TutorialSpotlight
          selector={tutorialSelector("aiHubProviders")}
          title={t("inApp.steps.connectAi.title")}
          hint={t("inApp.steps.connectAi.hint")}
          aside={
            o.arrivedAiConnected
              ? t("inApp.steps.connectAi.already")
              : undefined
          }
          asideCta={o.arrivedAiConnected ? t("inApp.skipStep") : undefined}
          onAsideCta={o.arrivedAiConnected ? o.skipAiStep : undefined}
        />
      );
    case "aiConnected":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("tutorial.missions.aiConnected.title")}
          body={t("tutorial.missions.aiConnected.body")}
          cta={t("tutorial.missions.aiConnected.cta")}
          onNext={o.afterAiSequence}
          checklist={checklist}
        />
      );
    case "integrationsIntro":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.integrationsIntro.title")}
          body={t("inApp.steps.integrationsIntro.body")}
          cta={t("inApp.steps.integrationsIntro.cta")}
          onNext={o.startIntegrationsSpot}
          checklist={checklist}
        />
      );
    case "openIntegrations":
      return (
        <TutorialSpotlight
          selector={tourSelector("nav-integrations")}
          title={t("inApp.steps.openIntegrations.title")}
        />
      );
    case "connectIntegration":
      return (
        <TutorialSpotlight
          selector={tutorialSelector("integrationsCatalog")}
          title={t("inApp.steps.connectIntegration.title")}
          hint={t("inApp.steps.connectIntegration.hint")}
          aside={
            o.arrivedIntegrationConnected
              ? t("inApp.steps.connectIntegration.already")
              : undefined
          }
          asideCta={
            o.arrivedIntegrationConnected ? t("inApp.skipStep") : undefined
          }
          onAsideCta={
            // Skip goes where the celebration goes — into the agent
            // sequence, never out of the tutorial.
            o.arrivedIntegrationConnected
              ? o.afterIntegrationsSequence
              : undefined
          }
        />
      );
    case "integrationConnected":
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.integrationConnected.title")}
          body={t("inApp.steps.integrationConnected.body")}
          cta={t("inApp.continue")}
          onNext={o.afterIntegrationsSequence}
          checklist={checklist}
        />
      );
    case "academyReveal":
      // Every path ends here: the setup the user just walked IS the Academy's
      // first chapter, and its experience is already theirs (awarded on the
      // finish this card's action runs).
      return (
        <TutorialCenterCard
          header={<HoustonLogo size={40} />}
          title={t("inApp.steps.academyReveal.title")}
          body={t("inApp.steps.academyReveal.body", {
            points: SETUP_CHAPTER_EXPERIENCE,
          })}
          cta={t("inApp.steps.academyReveal.cta")}
          onNext={o.visitAcademy}
          checklist={checklist}
        />
      );
    // The agent + first-task sequences (createAgentIntro → missionSent).
    default:
      return <InAppOnboardingAgentSteps o={o} />;
  }
}

/**
 * Arms the overlay from render-land (App.tsx's first-run "onboarding" route
 * renders the shell with this beside it). Arm-only: clearing is the flow's
 * own act, so a re-render never yanks a live overlay away. First-run arming
 * also stamps the durable `onboarding_pending` resume flag: creating the
 * agent flips the zero-agent first-run signal, so this flag is what brings a
 * quit-mid-setup user back into the flow on the next boot (cleared by every
 * finish).
 */
export function ArmInAppOnboarding() {
  const setActive = useUIStore((s) => s.setInAppOnboardingActive);
  const setFirstRun = useUIStore((s) => s.setInAppOnboardingFirstRun);
  const { markPending } = useOnboardingPending();
  useEffect(() => {
    setFirstRun(true);
    setActive(true);
    void markPending();
  }, [setActive, setFirstRun, markPending]);
  return null;
}
