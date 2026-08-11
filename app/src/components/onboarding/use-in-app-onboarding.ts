import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConversationFeed } from "../../hooks/use-conversation-vm";
import { analytics } from "../../lib/analytics";
import { fireSetupConfetti } from "../../lib/confetti";
import { openHome } from "../../lib/home-nav";
import {
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  isActiveTopLevelView,
  isMissionBoardSurface,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import {
  type InAppStep,
  inAppOnboardingAdvance,
} from "./in-app-onboarding-flow";
import { useEmailSetupCompleted } from "./missions/email-mission-setup";
import { useGuidedEmailTask } from "./use-guided-email-task";
import { useInAppOnboardingSignals } from "./use-in-app-signals";

/**
 * The in-app onboarding's live wiring: observes the app's own signals
 * ({@link useInAppOnboardingSignals}), runs the pure step machine
 * ({@link inAppOnboardingAdvance}) against them, and owns every side effect —
 * funnel analytics, the celebration confetti, and the guided email first task
 * ({@link useGuidedEmailTask}). The steps are rendered by
 * `in-app-onboarding.tsx`.
 *
 * The agent is created by the USER through the real New-agent dialog (its
 * auto setup-mission is suppressed while the tutorial runs, so the guided
 * send is the agent's FIRST mission).
 */
export function useInAppOnboarding() {
  const { t } = useTranslation("setup");
  const setActive = useUIStore((s) => s.setInAppOnboardingActive);
  const viewMode = useUIStore((s) => s.viewMode);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const createDialogOpen = useUIStore((s) => s.createAgentDialogOpen);
  const [step, setStep] = useState<InAppStep>("welcome");
  const signals = useInAppOnboardingSignals();
  const email = useGuidedEmailTask();

  // Arrival snapshots. The connect steps snapshot a boolean (already true →
  // the step renders its already-done addendum); the create/send steps
  // snapshot baselines, so only growth during the step counts.
  const [arrivedAiConnected, setArrivedAiConnected] = useState(false);
  const [arrivedIntegrationConnected, setArrivedIntegrationConnected] =
    useState(false);
  const [baselineAgentCount, setBaselineAgentCount] = useState<number | null>(
    null,
  );
  const [baselineMissionIds, setBaselineMissionIds] =
    useState<Set<string> | null>(null);
  // The New-task lesson needs a CLOSED panel first: only a panel the user's
  // own click opened counts. False on step entry; true once no panel is up.
  const [sendPanelReady, setSendPanelReady] = useState(false);

  // The mission the guided send created: the first row that was not there at
  // the send step's arrival. Carries (agent_path, session_key), which is all
  // the feed watch needs.
  const newMissionRow = useMemo(
    () =>
      baselineMissionIds
        ? signals.missionRows.find((r) => !baselineMissionIds.has(r.id))
        : undefined,
    [baselineMissionIds, signals.missionRows],
  );
  const feed = useConversationFeed(
    newMissionRow?.agent_path,
    newMissionRow?.session_key,
  );
  const emailSent = useEmailSetupCompleted(feed);

  // The onboarding funnel: one started event per run, one step-viewed per
  // screen reached (guarded so re-renders don't refire). `agent_created` and
  // `integration_connected` fire from the real flows themselves.
  useEffect(() => {
    analytics.track("onboarding_started", { source: "in_app" });
  }, []);
  const viewedSteps = useRef(new Set<string>());
  useEffect(() => {
    if (!viewedSteps.current.has(step)) {
      viewedSteps.current.add(step);
      analytics.track("onboarding_step_viewed", { step });
    }
  }, [step]);

  // Act on what the machine says the live signals mean.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the machine's inputs are the real dependencies; the celebrate branch reads the rest once at its guarded transition.
  useEffect(() => {
    const advance = inAppOnboardingAdvance(step, {
      onAiHub: isActiveTopLevelView(viewMode, AI_HUB_VIEW_ID),
      aiConnected: signals.aiConnected,
      arrivedAiConnected,
      onIntegrations: isActiveTopLevelView(viewMode, INTEGRATIONS_VIEW_ID),
      integrationConnected: signals.integrationConnected,
      arrivedIntegrationConnected,
      agentCreated:
        baselineAgentCount !== null && signals.agentCount > baselineAgentCount,
      missionSent: newMissionRow !== undefined,
      createDialogOpen,
      emailMode: email.armed,
      emailSent,
    });
    if (advance.kind === "stay") return;
    if (advance.kind === "goto") {
      if (advance.step === "connectAi")
        setArrivedAiConnected(signals.aiConnected);
      if (advance.step === "connectIntegration")
        setArrivedIntegrationConnected(signals.integrationConnected);
      if (advance.step === "emailSending")
        analytics.track("first_message_sent");
      setStep(advance.step);
      return;
    }
    // celebrate — with confetti over the shell the user is looking at.
    if (advance.step === "aiConnected") {
      analytics.track("ai_provider_connected", {
        provider: signals.connectedProviderId,
      });
    }
    if (advance.step === "agentCreated") email.captureCreatedAgent();
    if (advance.step === "missionSent") analytics.track("first_message_sent");
    if (advance.step === "emailSent") email.completed();
    fireSetupConfetti();
    setStep(advance.step);
  }, [
    step,
    viewMode,
    createDialogOpen,
    signals.aiConnected,
    arrivedAiConnected,
    signals.integrationConnected,
    arrivedIntegrationConnected,
    signals.agentCount,
    baselineAgentCount,
    newMissionRow,
    email.armed,
    emailSent,
  ]);

  // A lingering chat panel (kept-alive board, earlier session) would swallow
  // the New-task lesson: close it through the board's registered closer until
  // it is gone, and only then let panel-opens count as the user's own.
  useEffect(() => {
    if (step !== "sendMission" || sendPanelReady) return;
    if (!missionPanelOpen) {
      setSendPanelReady(true);
      return;
    }
    const close = () => useUIStore.getState().onPanelClose?.();
    close();
    const id = window.setInterval(close, 300);
    return () => window.clearInterval(id);
  }, [step, sendPanelReady, missionPanelOpen]);

  // The sidebar spot steps point into collapsible rail bands; a returning
  // user may have folded them away (persisted), which would leave the
  // spotlight nothing to find. Unfold before pointing.
  const expandMyAccounts = () => {
    const ui = useUIStore.getState();
    if (ui.myAccountsSectionCollapsed) ui.toggleMyAccountsSectionCollapsed();
  };
  const expandTeams = () => {
    const ui = useUIStore.getState();
    if (ui.teamsSectionCollapsed) ui.toggleTeamsSectionCollapsed();
  };

  const finish = () => {
    email.cleanup();
    setActive(false);
  };
  // Sequence handoffs, shared by BOTH exits of each sequence (celebration
  // Continue and the already-done skip — same destination).
  const afterIntegrationsSequence = () => {
    if (signals.canCreateAgents) setStep("createAgentIntro");
    else finish();
  };
  const afterAiSequence = () => {
    if (signals.integrationsOn) setStep("integrationsIntro");
    else afterIntegrationsSequence();
  };

  return {
    step,
    /** The user's own click opened the panel (the lesson's second phase). */
    userPanelOpen: sendPanelReady && missionPanelOpen,
    missionPanelOpen,
    /** Checklist gates: which setup items exist for this deployment/caller. */
    integrationsOn: signals.integrationsOn,
    canCreateAgents: signals.canCreateAgents,
    arrivedAiConnected,
    arrivedIntegrationConnected,
    /** The create-agent addendum: the user already had an agent on arrival. */
    arrivedHasAgent: baselineAgentCount !== null && baselineAgentCount > 0,
    /** The guided first task is the prewritten email variant. */
    emailMode: email.armed,
    startAiIntro: () => setStep("connectAiIntro"),
    startAiSpot: () => {
      expandMyAccounts();
      setStep("openAiHub");
    },
    skipAiStep: afterAiSequence,
    afterAiSequence,
    startIntegrationsSpot: () => {
      expandMyAccounts();
      setStep("openIntegrations");
    },
    afterIntegrationsSequence,
    startCreateAgentSpot: () => {
      expandTeams();
      setBaselineAgentCount(signals.agentCount);
      setStep("createAgent");
    },
    skipCreateAgent: () => setStep("sendMissionIntro"),
    startSendMissionIntro: () => setStep("sendMissionIntro"),
    startSendMissionSpot: () => {
      // The taught mechanic is the New task button, and the panel must be the
      // one the USER'S click opens: the auto-open is suppressed during the
      // tutorial (use-mc-new-mission.tsx), any leftover panel is closed by
      // the effect above (through the board's registered closer — never by
      // force-wiping owner claims, which desyncs the board into an inline
      // panel the store knows nothing about).
      const ui = useUIStore.getState();
      ui.setActivityPanelId(null);
      setSendPanelReady(false);
      // The button lives on a mission board; the user may be standing on the
      // AI hub or Integrations view (the skip paths end there).
      if (
        !isMissionBoardSurface({
          viewMode: ui.viewMode,
          teamSection: ui.teamSection,
        })
      ) {
        openHome();
      }
      setBaselineMissionIds(new Set(signals.missionRows.map((r) => r.id)));
      // Email variant when possible: prewrite the locked first task and prime
      // the agent (CLAUDE.md directive). Falls back to free text on its own
      // if arming fails or no email toolkit is connected.
      email.arm({
        toolkit: signals.emailToolkit,
        draftText: t("tutorial.missions.email.offer.option"),
      });
      setStep("sendMission");
    },
    finish,
  };
}
