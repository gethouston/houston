import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToastContainer, type Toast } from "@houston-ai/core";
import { analytics } from "../../lib/analytics";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { tauriProvider, tauriWorkspaces } from "../../lib/tauri";
import { getDefaultModel } from "../../lib/providers";
import type { Agent } from "../../lib/types";
import { MissionFrame } from "./mission-frame";
import { MeetMission } from "./missions/meet";
import { BrainMission } from "./missions/brain";
import { ToolsMission } from "./missions/tools";
import { EmailMission } from "./missions/email";
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
  const [assistantName, setAssistantName] = useState(() =>
    t("setup:tutorial.defaults.assistantName"),
  );
  const [assistantColor, setAssistantColor] = useState("navy");

  // Title stamped on the agent's first-run instructions — the one task setup
  // walks the user through.
  const missionTitle = t("setup:tutorial.missions.email.chip");

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
    const ws = await tauriWorkspaces.create(setup.workspaceName.trim());
    // Persist the picked pair as the new global default so the next new agent
    // starts from the same place the user just chose during onboarding.
    await tauriProvider.setLastUsed(pickedProvider, pickedModel);
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

  // Terminal hand-off. Arm the UI tour BEFORE clearing `tutorialActive`
  // so the workspace shell mounts with the tour overlay already up —
  // no flicker of bare workspace. Called when the email sends (the email
  // mission's "Enter Houston" CTA) AND by the always-on escape gate so a
  // user who bails midway still lands in the workspace shell cleanly.
  const finishOnboarding = () => {
    analytics.track("onboarding_completed", {
      mission: TUTORIAL_MISSION.id,
      integrations_skipped: false,
      tutorial_run: true,
    });
    setUiTourActive(true);
    setTutorialActive(false);
  };

  // Provider/model the back-half missions (Try, Routine) run against. The
  // user picks these in the Brain mission; fall back to the platform default
  // model for the chosen provider if a mission renders before a pick.
  const missionProvider = provider ?? "anthropic";
  const missionModel = model ?? getDefaultModel(missionProvider);

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
            t("setup:tutorial.welcome.steps.email"),
          ]}
          startLabel={t("setup:tutorial.welcome.start")}
          onStart={startTutorial}
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
          <ToolsMission onContinue={() => setStep("email")} />
        </MissionFrame>
      )}
      {meta && frame && step === "email" && agent && (
        <EmailMission
          meta={meta}
          frame={frame}
          agent={agent}
          assistantColor={assistantColor}
          provider={missionProvider}
          model={missionModel}
          onContinue={finishOnboarding}
          onSkip={finishOnboarding}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </>
  );
}
