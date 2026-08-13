import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboardingCompleted } from "../../hooks/use-onboarding-completed";
import { useOnboardingPending } from "../../hooks/use-onboarding-pending";
import { analytics } from "../../lib/analytics";
import { openHome } from "../../lib/home-nav";
import {
  ACADEMY_VIEW_ID,
  isMissionBoardSurface,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import type { InAppStep } from "./in-app-onboarding-flow";
import { useGuidedEmailTask } from "./use-guided-email-task";
import { useInAppAdvance } from "./use-in-app-advance";
import { useInAppOnboardingSignals } from "./use-in-app-signals";
import { useSendMissionDiscipline } from "./use-send-mission-discipline";
import { useSetupChapterAward } from "./use-setup-chapter-award";

/**
 * The in-app onboarding's live wiring: observes the app's own signals
 * ({@link useInAppOnboardingSignals}), owns the run's state and the actions
 * the steps call, and drives the guided email first task
 * ({@link useGuidedEmailTask}) plus the send-step discipline
 * ({@link useSendMissionDiscipline}). Running the pure step machine against
 * the signals — and the analytics/confetti that ride each transition — is
 * {@link useInAppAdvance}. The steps are rendered by `in-app-onboarding.tsx`.
 *
 * Durable lifecycle: a FIRST-RUN arming marks `onboarding_pending` (see
 * `ArmInAppOnboarding`) so a quit mid-flow resumes the setup on the next
 * boot — the agent's creation flips the zero-agent first-run signal, so the
 * pending flag is the only resume contract. Every finish clears it and
 * stamps `onboarding_completed`.
 */
export function useInAppOnboarding() {
  const { t } = useTranslation("setup");
  const setActive = useUIStore((s) => s.setInAppOnboardingActive);
  const firstRun = useUIStore((s) => s.inAppOnboardingFirstRun);
  const viewMode = useUIStore((s) => s.viewMode);
  const createDialogOpen = useUIStore((s) => s.createAgentDialogOpen);
  const [step, setStep] = useState<InAppStep>("welcome");
  const signals = useInAppOnboardingSignals();
  const email = useGuidedEmailTask();
  const send = useSendMissionDiscipline({
    active: step === "sendMission",
    watching: step === "emailSending",
    missionRows: signals.missionRows,
    missionRowsSettled: signals.missionRowsSettled,
    emailAgentPath: email.agentPath,
  });
  const { clearPending } = useOnboardingPending();
  const { markCompleted } = useOnboardingCompleted();
  const awardSetupChapter = useSetupChapterAward();

  // Arrival snapshots: already true → the step renders its already-done
  // addendum, and an old success is never re-celebrated.
  const [arrivedAiConnected, setArrivedAiConnected] = useState(false);
  const [arrivedIntegrationConnected, setArrivedIntegrationConnected] =
    useState(false);
  const [baselineAgentCount, setBaselineAgentCount] = useState<number | null>(
    null,
  );

  // The onboarding funnel: one started event per run, tagged with which kind
  // of run (`firstRun` is set before arming and stable for the run), one
  // step-viewed per screen reached. `agent_created` and
  // `integration_connected` fire from the real flows themselves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only.
  useEffect(() => {
    analytics.track("onboarding_started", {
      source: firstRun ? "in_app" : "in_app_replay",
    });
  }, []);
  const viewedSteps = useRef(new Set<string>());
  useEffect(() => {
    if (!viewedSteps.current.has(step)) {
      viewedSteps.current.add(step);
      analytics.track("onboarding_step_viewed", { step });
    }
  }, [step]);

  useInAppAdvance({
    step,
    setStep,
    viewMode,
    createDialogOpen,
    signals,
    email,
    send,
    arrivedAiConnected,
    setArrivedAiConnected,
    arrivedIntegrationConnected,
    setArrivedIntegrationConnected,
    baselineAgentCount,
  });

  // The sidebar spot steps point into collapsible rail bands; a returning
  // user may have folded them away (persisted), which would leave the
  // spotlight nothing to find. Unfold before pointing.
  const expandBand = (which: "myAccounts" | "teams") => {
    const ui = useUIStore.getState();
    if (which === "myAccounts" && ui.myAccountsSectionCollapsed)
      ui.toggleMyAccountsSectionCollapsed();
    if (which === "teams" && ui.teamsSectionCollapsed)
      ui.toggleTeamsSectionCollapsed();
  };

  const finish = () => {
    email.cleanup();
    // Terminal, and the ONLY way a run ends: the setup never re-enters on the
    // next boot, the funnel gets its closing event, and the Academy's first
    // chapter is paid. The award lives here rather than in the reveal card's
    // handler so it can never depend on which button ended the run.
    const source = firstRun ? "in_app" : "in_app_replay";
    analytics.track("onboarding_completed", { source });
    awardSetupChapter(source);
    void clearPending();
    void markCompleted();
    setActive(false);
  };
  const afterIntegrationsSequence = () => {
    if (signals.canCreateAgents) setStep("createAgentIntro");
    else setStep("academyReveal");
  };

  return {
    step,
    userPanelOpen: send.userPanelOpen,
    emailStuck: send.emailStuck,
    integrationsOn: signals.integrationsOn,
    canCreateAgents: signals.canCreateAgents,
    arrivedAiConnected,
    arrivedIntegrationConnected,
    arrivedHasAgent: baselineAgentCount !== null && baselineAgentCount > 0,
    emailMode: email.armed,
    startAiIntro: () => setStep("connectAiIntro"),
    startAiSpot: () => {
      expandBand("myAccounts");
      setStep("openAiHub");
    },
    skipAiStep: () => {
      if (signals.integrationsOn) setStep("integrationsIntro");
      else afterIntegrationsSequence();
    },
    afterAiSequence: () => {
      if (signals.integrationsOn) setStep("integrationsIntro");
      else afterIntegrationsSequence();
    },
    startIntegrationsSpot: () => {
      expandBand("myAccounts");
      setStep("openIntegrations");
    },
    afterIntegrationsSequence,
    startCreateAgentSpot: () => {
      expandBand("teams");
      setBaselineAgentCount(signals.agentCount);
      setStep("createAgent");
    },
    skipCreateAgent: () => setStep("sendMissionIntro"),
    startSendMissionIntro: () => setStep("sendMissionIntro"),
    startSendMissionSpot: () => {
      // The taught mechanic is the New task CLICK: the discipline hook closes
      // any lingering panel and seeds the mission baseline from a settled
      // sweep; navigate to a board if the user is standing elsewhere.
      const ui = useUIStore.getState();
      ui.setActivityPanelId(null);
      send.begin();
      email.arm({
        toolkit: signals.emailToolkit,
        draftText: t("tutorial.missions.email.offer.option"),
      });
      if (
        !isMissionBoardSurface({
          viewMode: ui.viewMode,
          teamSection: ui.teamSection,
        })
      ) {
        openHome();
      }
      setStep("sendMission");
    },
    /** The watch beat's way onward when the agent errored or takes too long:
     *  the task WAS sent, so it ends on the honest sent finale. */
    abandonEmailWait: () => setStep("missionSent"),
    /** Every finale hands off to the reveal — the setup was chapter one. */
    startAcademyReveal: () => setStep("academyReveal"),
    /** The reveal's one action: end the run, then land in the Academy so the
     *  reward the card just announced is on screen. */
    visitAcademy: () => {
      finish();
      useUIStore.getState().setViewMode(ACADEMY_VIEW_ID);
    },
  };
}
