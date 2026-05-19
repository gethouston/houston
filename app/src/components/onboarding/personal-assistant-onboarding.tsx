import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToastContainer, type Toast } from "@houston-ai/core";
import { analytics } from "../../lib/analytics";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { tauriWorkspaces } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { MissionFrame } from "./mission-frame";
import { MeetMission } from "./missions/meet";
import { BrainMission } from "./missions/brain";
import { ToolsMission } from "./missions/tools";
import { TryMission } from "./missions/try";
import { SkillMission } from "./missions/skill";
import { RoutineMission } from "./missions/routine";
import { SummaryScreen } from "./summary-screen";
import { WelcomeScreen } from "./welcome-screen";
import { createPersonalAssistantForWorkspace } from "./create-personal-assistant";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts";
import { TUTORIAL_MISSION } from "./personal-assistant-missions";
import {
  buildFrameLabels,
  buildMissionMeta,
  type OnboardingStep,
  type TutorialStep,
} from "./tutorial-copy";

interface PersonalAssistantOnboardingProps {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}

export function PersonalAssistantOnboarding({
  toasts,
  onDismissToast,
}: PersonalAssistantOnboardingProps) {
  const { t } = useTranslation(["setup", "common"]);
  const setTutorialActive = useUIStore((s) => s.setTutorialActive);
  const setUiTourActive = useUIStore((s) => s.setUiTourActive);
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  /**
   * Activity session key minted by the Try mission's `createMission` call.
   * The Routine mission re-uses the same session so the chat history (the
   * agent's full day-plan reply with the bold sections) carries over and
   * the agent can reference it while writing the routine prompt.
   */
  const [missionSessionKey, setMissionSessionKey] = useState<string | null>(
    null,
  );
  const [assistantName, setAssistantName] = useState(() =>
    t("setup:tutorial.defaults.assistantName"),
  );
  const [assistantColor, setAssistantColor] = useState("navy");

  const missionTitle = t("setup:tutorial.missions.try.skill.title");

  const missionStep = step === "welcome" ? null : (step as TutorialStep);
  const meta = missionStep ? buildMissionMeta(t, missionStep) : null;
  const frame = missionStep ? buildFrameLabels(t, missionStep) : null;

  // `tutorialActive` pins the orchestrator in front of the workspace shell so
  // the workspace-create event in M2 (Brain) doesn't unmount us. Set on the
  // user's explicit Start / Skip click — NOT on mount — so a returning user
  // whose first paint briefly falls through `workspaces.length === 0` is not
  // trapped here once their real workspaces arrive.
  const startTutorial = () => {
    analytics.track("onboarding_started", { source: "tutorial" });
    setTutorialActive(true);
    setStep("meet");
  };

  const createWorkspaceAndAssistant = async (
    pickedProvider: string,
    pickedModel: string,
  ): Promise<Agent> => {
    const setup = defaultAssistantSetup({
      workspaceName: t("setup:tutorial.defaults.workspaceName"),
      assistantName: assistantName.trim() || t("setup:tutorial.defaults.assistantName"),
      focus: t("setup:tutorial.defaults.focus"),
      approvalRule: t("setup:tutorial.defaults.approvalRule"),
    });
    setup.color = assistantColor;
    const ws = await tauriWorkspaces.create(
      setup.workspaceName.trim(),
      pickedProvider,
      pickedModel,
    );
    analytics.track("workspace_created", { provider: pickedProvider, source: "onboarding" });
    const created = await createPersonalAssistantForWorkspace(ws.id, {
      name: setup.assistantName.trim(),
      instructions: buildAssistantInstructions(setup, missionTitle),
      color: setup.color,
      provider: pickedProvider,
      model: pickedModel,
    });
    await useWorkspaceStore.getState().loadWorkspaces();
    useWorkspaceStore.getState().setCurrent(ws);
    await useAgentStore.getState().loadAgents(ws.id);
    const refreshed =
      useAgentStore.getState().agents.find((a) => a.id === created.id) ?? created;
    useAgentStore.getState().setCurrent(refreshed);
    setAgent(refreshed);
    return refreshed;
  };

  const handleSkip = async () => {
    // Skip path: create the workspace + assistant, but no UI tour and no
    // tutorial artifacts. User lands directly in the workspace shell.
    analytics.track("onboarding_started", { source: "skip" });
    setTutorialActive(true);
    try {
      const fallbackProvider = provider ?? "anthropic";
      const fallbackModel = model ?? "sonnet";
      await createWorkspaceAndAssistant(fallbackProvider, fallbackModel);
      analytics.track("onboarding_completed", {
        mission: TUTORIAL_MISSION.id,
        integrations_skipped: true,
        tutorial_run: false,
      });
    } finally {
      setTutorialActive(false);
    }
  };

  // Step transitions for the back-half of the tutorial (Try → Skill →
  // Routine → Summary → app tour). None of them clear `tutorialActive`
  // — each next step still owns the screen, and clearing here would
  // let the workspace shell race in behind. `onboarding_completed`
  // fires at the very end (after the Summary "Enter Houston" CTA or
  // an explicit Skip).
  const handleTryComplete = () => setStep("skill");
  const handleSkillComplete = () => setStep("routine");
  const handleRoutineComplete = () => setStep("summary");

  // Terminal hand-off. Arm the UI tour BEFORE clearing `tutorialActive`
  // so the workspace shell mounts with the tour overlay already up —
  // no flicker of bare workspace. Called by the Summary CTA AND by
  // every always-on Skip link in M4-M6 so a user who bails midway
  // still lands in the workspace shell cleanly.
  const finishOnboarding = () => {
    analytics.track("onboarding_completed", {
      mission: TUTORIAL_MISSION.id,
      integrations_skipped: false,
      tutorial_run: true,
    });
    setUiTourActive(true);
    setTutorialActive(false);
  };

  return (
    <>
      {step === "welcome" && (
        <WelcomeScreen
          title={t("setup:tutorial.welcome.title")}
          tagline={t("setup:tutorial.welcome.tagline")}
          stepsTitle={t("setup:tutorial.welcome.stepsTitle")}
          steps={[
            t("setup:tutorial.welcome.steps.meet"),
            t("setup:tutorial.welcome.steps.brain"),
            t("setup:tutorial.welcome.steps.tools"),
            t("setup:tutorial.welcome.steps.try"),
            t("setup:tutorial.welcome.steps.routine"),
          ]}
          startLabel={t("setup:tutorial.welcome.start")}
          skipLabel={t("setup:tutorial.welcome.skip")}
          onStart={startTutorial}
          onSkip={() => void handleSkip()}
        />
      )}
      {meta && frame && step === "meet" && (
        <MissionFrame meta={meta} {...frame}>
          <MeetMission
            name={assistantName}
            color={assistantColor}
            namePlaceholder={t("setup:tutorial.defaults.assistantName")}
            beginLabel={t("setup:tutorial.missions.meet.begin")}
            onNameChange={setAssistantName}
            onColorChange={setAssistantColor}
            onBegin={() => setStep("brain")}
          />
        </MissionFrame>
      )}
      {meta && frame && step === "brain" && (
        <MissionFrame meta={meta} {...frame}>
          <BrainMission
            provider={provider}
            onSelect={(p, m) => {
              setProvider(p);
              setModel(m);
            }}
            onContinue={async () => {
              if (!provider || !model) return;
              await createWorkspaceAndAssistant(provider, model);
              setStep("tools");
            }}
          />
        </MissionFrame>
      )}
      {meta && frame && step === "tools" && (
        <MissionFrame meta={meta} {...frame}>
          <ToolsMission onContinue={() => setStep("try")} />
        </MissionFrame>
      )}
      {meta && frame && step === "try" && agent && (
        <TryMission
          meta={meta}
          frame={frame}
          agent={agent}
          assistantColor={assistantColor}
          provider={provider ?? "anthropic"}
          model={model ?? "sonnet"}
          onSessionKey={setMissionSessionKey}
          onContinue={handleTryComplete}
          onSkip={finishOnboarding}
        />
      )}
      {meta && frame && step === "skill" && agent && missionSessionKey && (
        <SkillMission
          meta={meta}
          frame={frame}
          agent={agent}
          assistantColor={assistantColor}
          sessionKey={missionSessionKey}
          onContinue={handleSkillComplete}
          onSkip={finishOnboarding}
        />
      )}
      {meta && frame && step === "routine" && agent && missionSessionKey && (
        <RoutineMission
          meta={meta}
          frame={frame}
          agent={agent}
          assistantColor={assistantColor}
          provider={provider ?? "anthropic"}
          model={model ?? "sonnet"}
          sessionKey={missionSessionKey}
          onContinue={handleRoutineComplete}
          onSkip={finishOnboarding}
        />
      )}
      {frame && step === "summary" && agent && (
        <SummaryScreen
          frame={frame}
          agent={agent}
          assistantColor={assistantColor}
          onContinue={finishOnboarding}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </>
  );
}
