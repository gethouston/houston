import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToastContainer, type Toast } from "@houston-ai/core";
import { analytics } from "../../lib/analytics";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { tauriAgents, tauriProvider, tauriWorkspaces } from "../../lib/tauri";
import { getDefaultModel } from "../../lib/providers";
import type { Agent } from "../../lib/types";
import { MeetMission } from "./missions/meet";
import { BrainMission } from "./missions/brain";
import { ProviderLoginMission } from "./missions/provider-login";
import { ToolsMission } from "./missions/tools";
import { ConnectEmailMission } from "./missions/connect-email";
import { EmailMission } from "./missions/email";
import { FinishedMission } from "./missions/finished";
import { SetupProgress } from "./setup-progress";
import { createPersonalAssistantForWorkspace } from "./create-personal-assistant";
import { ensureWorkspaceWithAssistant } from "./ensure-default-assistant";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts";
import { TUTORIAL_MISSION } from "./personal-assistant-missions";
import { type OnboardingStep } from "./tutorial-copy";
import { stepSection } from "../../lib/setup-steps";

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
  const addToast = useUIStore((s) => s.addToast);
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  // Set while the create-agent step is provisioning, to drive the loading state.
  const [creatingAgent, setCreatingAgent] = useState(false);
  // The email toolkit connected in the "give access to your email" step.
  const [emailTool, setEmailTool] = useState<{
    toolkit: string;
    label: string;
  } | null>(null);
  const [assistantName, setAssistantName] = useState(() =>
    t("setup:tutorial.defaults.assistantName"),
  );
  const [assistantColor, setAssistantColor] = useState("navy");
  // Collapses concurrent / repeated default-workspace creation onto a single
  // in-flight operation so first-run can never fire `createWorkspace` twice
  // (a double-clicked Continue, a remount) — HOU-444.
  const creationRef = useRef<Promise<Agent> | null>(null);

  // Title stamped on the agent's first-run instructions.
  const missionTitle = t("setup:tutorial.missions.email.chip");

  // `tutorialActive` pins the orchestrator in front of the workspace shell so
  // the workspace-create event in the create step doesn't unmount us.
  useEffect(() => {
    analytics.track("onboarding_started", { source: "setup" });
    setTutorialActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire one step-viewed event per screen reached so a single funnel shows
  // exactly where people drop off. Guarded so re-renders / Back don't refire.
  const viewedSteps = useRef(new Set<string>());
  useEffect(() => {
    if (!viewedSteps.current.has(step)) {
      viewedSteps.current.add(step);
      analytics.track("onboarding_step_viewed", { step });
    }
  }, [step]);

  const createWorkspaceAndAssistant = (
    pickedProvider: string,
    pickedModel: string,
  ): Promise<Agent> => {
    if (creationRef.current) return creationRef.current;

    const op = (async (): Promise<Agent> => {
      const setup = defaultAssistantSetup({
        workspaceName: t("setup:tutorial.defaults.workspaceName"),
        assistantName:
          assistantName.trim() || t("setup:tutorial.defaults.assistantName"),
        focus: t("setup:tutorial.defaults.focus"),
        approvalRule: t("setup:tutorial.defaults.approvalRule"),
      });
      setup.color = assistantColor;

      const { workspace: ws, assistant: created, createdWorkspace } =
        await ensureWorkspaceWithAssistant(setup.workspaceName, {
          listWorkspaces: () => tauriWorkspaces.list(),
          createWorkspace: (name) => tauriWorkspaces.create(name),
          listAgents: (workspaceId) => tauriAgents.list(workspaceId),
          createAssistant: (workspaceId) =>
            createPersonalAssistantForWorkspace(workspaceId, {
              name: setup.assistantName.trim(),
              instructions: buildAssistantInstructions(setup, missionTitle),
              color: setup.color,
              provider: pickedProvider,
              model: pickedModel,
            }),
        });

      await tauriProvider.setLastUsed(pickedProvider, pickedModel);
      if (createdWorkspace) {
        analytics.track("workspace_created", {
          provider: pickedProvider,
          source: "onboarding",
        });
      }
      await useWorkspaceStore.getState().loadWorkspaces();
      useWorkspaceStore.getState().setCurrent(ws);
      await useAgentStore.getState().loadAgents(ws.id);
      const refreshed =
        useAgentStore.getState().agents.find((a) => a.id === created.id) ??
        created;
      useAgentStore.getState().setCurrent(refreshed);
      setAgent(refreshed);
      return refreshed;
    })();

    creationRef.current = op;
    op.catch(() => {
      creationRef.current = null;
    });
    return op;
  };

  // Terminal hand-off. Arm the UI tour BEFORE clearing `tutorialActive` so the
  // workspace shell mounts with the tour overlay already up — no flicker.
  const finishOnboarding = (withTour: boolean) => {
    analytics.track("onboarding_completed", {
      mission: TUTORIAL_MISSION.id,
      integrations_skipped: false,
      tutorial_run: true,
      source: withTour ? "tour" : "connect_more",
    });
    if (withTour) setUiTourActive(true);
    setTutorialActive(false);
  };

  // The create-agent step owns provisioning the workspace + assistant. By here
  // provider/model are picked; reused creation is deduped (HOU-444).
  const handleCreateAgent = async () => {
    if (!provider || !model) return;
    setCreatingAgent(true);
    try {
      analytics.track("onboarding_assistant_named");
      await createWorkspaceAndAssistant(provider, model);
      setCreatingAgent(false);
      setStep("agentCreated");
    } catch (err) {
      addToast({
        title: t("setup:tutorial.errors.setupFailed"),
        description: String(err),
        variant: "error",
      });
      setCreatingAgent(false);
    }
  };

  // Provider/model the email send runs against (fall back to the default).
  const missionProvider = provider ?? "anthropic";
  const missionModel = model ?? getDefaultModel(missionProvider);

  // Section-aware eyebrow: "Setup · 1 of 2", "Onboarding · 2 of 3". Empty for
  // screens that aren't numbered steps (never rendered on those).
  const stepEyebrow = (screen: string): string => {
    const s = stepSection(screen);
    if (!s) return "";
    const sectionName =
      s.section === "setup"
        ? t("setup:tutorial.sections.setup")
        : t("setup:tutorial.sections.onboarding");
    return t("setup:tutorial.sectionCounter", {
      section: sectionName,
      current: s.current,
      total: s.total,
    });
  };

  return (
    <>
      {step === "intro" && (
        <SetupProgress
          section="setup"
          title={t("setup:tutorial.missions.intro.title")}
          message={t("setup:tutorial.missions.intro.body")}
          done={[]}
          ctaLabel={t("setup:tutorial.missions.intro.cta")}
          onContinue={() => setStep("brain")}
        />
      )}

      {step === "brain" && (
        <BrainMission
          eyebrow={stepEyebrow("brain")}
          provider={provider}
          onBack={() => setStep("intro")}
          onSelect={(p, m) => {
            setProvider(p);
            setModel(m);
          }}
          onContinue={() => setStep("providerLogin")}
        />
      )}
      {step === "providerLogin" && provider && (
        <ProviderLoginMission
          eyebrow={stepEyebrow("providerLogin")}
          providerId={provider}
          onBack={() => setStep("brain")}
          onContinue={() => setStep("aiConnected")}
        />
      )}
      {step === "aiConnected" && (
        <SetupProgress
          section="setup"
          title={t("setup:tutorial.missions.aiConnected.title")}
          message={t("setup:tutorial.missions.aiConnected.body")}
          done={["ai"]}
          justCompleted="ai"
          ctaLabel={t("setup:tutorial.missions.aiConnected.cta")}
          onContinue={() => setStep("tools")}
        />
      )}

      {step === "tools" && (
        <ToolsMission
          eyebrow={stepEyebrow("tools")}
          onBack={() => setStep("providerLogin")}
          onContinue={() => setStep("appsConnected")}
        />
      )}
      {step === "appsConnected" && (
        <SetupProgress
          section="setup"
          title={t("setup:tutorial.missions.appsConnected.title")}
          message={t("setup:tutorial.missions.appsConnected.body")}
          done={["ai", "apps"]}
          justCompleted="apps"
          ctaLabel={t("setup:tutorial.missions.appsConnected.cta")}
          onContinue={() => setStep("onboardingIntro")}
        />
      )}
      {step === "onboardingIntro" && (
        <SetupProgress
          section="onboarding"
          title={t("setup:tutorial.missions.onboardingIntro.title")}
          message={t("setup:tutorial.missions.onboardingIntro.body")}
          done={[]}
          ctaLabel={t("setup:tutorial.missions.onboardingIntro.cta")}
          onContinue={() => setStep("meet")}
        />
      )}

      {step === "meet" && (
        <MeetMission
          eyebrow={stepEyebrow("meet")}
          name={assistantName}
          color={assistantColor}
          namePlaceholder={t("setup:tutorial.defaults.assistantName")}
          onNameChange={setAssistantName}
          onColorChange={setAssistantColor}
          creating={creatingAgent}
          onBegin={() => void handleCreateAgent()}
        />
      )}
      {step === "agentCreated" && (
        <SetupProgress
          section="onboarding"
          title={t("setup:tutorial.missions.agentCreated.title")}
          message={t("setup:tutorial.missions.agentCreated.body")}
          done={["agent"]}
          justCompleted="agent"
          ctaLabel={t("setup:tutorial.missions.agentCreated.cta")}
          onContinue={() => setStep("connectEmail")}
        />
      )}

      {step === "connectEmail" && (
        <ConnectEmailMission
          eyebrow={stepEyebrow("connectEmail")}
          onBack={() => setStep("meet")}
          onConnected={(toolkit, label) => {
            // Capture which email the user connected (connectApp doesn't route
            // through the AI card, so the global tracker wouldn't see it).
            analytics.track("integration_connected", {
              integration_slug: toolkit,
            });
            setEmailTool({ toolkit, label });
            setStep("emailConnected");
          }}
        />
      )}
      {step === "emailConnected" && (
        <SetupProgress
          section="onboarding"
          title={t("setup:tutorial.missions.emailConnected.title")}
          message={t("setup:tutorial.missions.emailConnected.body")}
          done={["agent", "email"]}
          justCompleted="email"
          ctaLabel={t("setup:tutorial.missions.emailConnected.cta")}
          onContinue={() => setStep("emailChat")}
        />
      )}

      {step === "emailChat" && agent && emailTool && (
        <EmailMission
          eyebrow={stepEyebrow("emailChat")}
          agent={agent}
          assistantColor={assistantColor}
          provider={missionProvider}
          model={missionModel}
          emailToolkit={emailTool.toolkit}
          emailToolkitLabel={emailTool.label}
          onBack={() => setStep("connectEmail")}
          onContinue={() => setStep("emailSent")}
        />
      )}
      {step === "emailSent" && (
        <SetupProgress
          section="onboarding"
          title={t("setup:tutorial.missions.emailSent.title")}
          message={t("setup:tutorial.missions.emailSent.body")}
          done={["agent", "email", "send"]}
          justCompleted="send"
          ctaLabel={t("setup:tutorial.missions.emailSent.cta")}
          onContinue={() => setStep("finished")}
        />
      )}

      {step === "finished" && (
        <FinishedMission
          onTour={() => finishOnboarding(true)}
          onConnectMore={() => finishOnboarding(false)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </>
  );
}
