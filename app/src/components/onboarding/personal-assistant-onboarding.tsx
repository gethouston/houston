import { type Toast, ToastContainer } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { getDefaultModel } from "../../lib/providers";
import { stepSection } from "../../lib/setup-steps";
import { useUIStore } from "../../stores/ui";
import { BrainMission } from "./missions/brain";
import { ConnectEmailMission } from "./missions/connect-email";
import { EmailMission } from "./missions/email";
import { FinishedMission } from "./missions/finished";
import { MeetMission } from "./missions/meet";
import { stepAfterAgentCreated } from "./missions/onboarding-flow";
import { ProviderLoginMission } from "./missions/provider-login";
import { TUTORIAL_MISSION } from "./personal-assistant-missions";
import { SetupProgress } from "./setup-progress";
import type { OnboardingStep } from "./tutorial-copy";
import { useCreateAssistant } from "./use-create-assistant";

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
  const setViewMode = useUIStore((s) => s.setViewMode);
  const addToast = useUIStore((s) => s.addToast);
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  // The email toolkit connected in the "give access to your email" step.
  const [emailTool, setEmailTool] = useState<{
    toolkit: string;
    label: string;
  } | null>(null);
  const [assistantName, setAssistantName] = useState(() =>
    t("setup:tutorial.defaults.assistantName"),
  );
  const [assistantColor, setAssistantColor] = useState("navy");

  // The email detour only works where the host serves the integrations routes;
  // App has already awaited capabilities load before mounting us, so this is
  // resolved (null only on the legacy Rust engine → straight to finish).
  const { capabilities } = useCapabilities();

  // Title stamped on the agent's first-run instructions.
  const missionTitle = t("setup:tutorial.missions.email.chip");
  const {
    agent,
    creating: creatingAgent,
    create,
  } = useCreateAssistant({ assistantName, assistantColor, missionTitle });

  // `tutorialActive` pins the orchestrator in front of the workspace shell so
  // the workspace-create event in the create step doesn't unmount us.
  useEffect(() => {
    analytics.track("onboarding_started", { source: "setup" });
    setTutorialActive(true);
  }, [setTutorialActive]);

  // Fire one step-viewed event per screen reached so a single funnel shows
  // exactly where people drop off. Guarded so re-renders / Back don't refire.
  const viewedSteps = useRef(new Set<string>());
  useEffect(() => {
    if (!viewedSteps.current.has(step)) {
      viewedSteps.current.add(step);
      analytics.track("onboarding_step_viewed", { step });
    }
  }, [step]);

  // Terminal hand-off. Arm the UI tour BEFORE clearing `tutorialActive` so the
  // workspace shell mounts with the tour overlay already up — no flicker.
  const finishOnboarding = (next: "tour" | "integrations") => {
    analytics.track("onboarding_completed", {
      mission: TUTORIAL_MISSION.id,
      integrations_skipped: false,
      tutorial_run: true,
      source: next === "tour" ? "tour" : "connect_more",
    });
    if (next === "tour") setUiTourActive(true);
    // "Connect more apps" lands the user in the Integrations browser.
    else setViewMode("connections");
    setTutorialActive(false);
  };

  // The create-agent step owns provisioning the workspace + assistant. By here
  // provider/model are picked; reused creation is deduped inside the hook.
  const handleCreateAgent = async () => {
    if (!provider || !model) return;
    try {
      analytics.track("onboarding_assistant_named");
      await create(provider, model);
      setStep("agentCreated");
    } catch (err) {
      addToast({
        title: t("setup:tutorial.errors.setupFailed"),
        description: String(err),
        variant: "error",
      });
    }
  };

  // Provider/model the email send runs against (fall back to the default).
  const missionProvider = provider ?? "anthropic";
  const missionModel = model ?? getDefaultModel(missionProvider);

  // Escape hatch (HOU-555): the final email step auto-advances on a marker the
  // agent must emit, but some models send the email and never emit it, stranding
  // the user with no way forward. Let them bail into the app. This is NOT a
  // completion: it fires `onboarding_skipped` (not `onboarding_completed`) with
  // the model, so analytics can separate "stuck and skipped" from a normal
  // finish and surface which models strand users.
  const skipOnboarding = (fromStep: OnboardingStep) => {
    analytics.track("onboarding_skipped", {
      step: fromStep,
      provider: missionProvider,
      model: missionModel,
      source: "stuck",
    });
    setTutorialActive(false);
  };

  // Softer escape for the connect-email dead ends (gateway unready, OAuth
  // failed): skip ONLY the email steps and land on the finish screen, keeping
  // the tour hand-off. Fires `onboarding_skipped` so analytics can see the
  // email detour was abandoned even though `onboarding_completed` follows.
  const skipEmailSteps = () => {
    analytics.track("onboarding_skipped", {
      step: "connectEmail",
      provider: missionProvider,
      model: missionModel,
      source: "stuck",
    });
    setStep("finished");
  };

  // Section-aware eyebrow: "Setup · 1 of 1", "Onboarding · 2 of 3". Empty for
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
          onContinue={() => setStep(stepAfterAgentCreated(capabilities))}
        />
      )}

      {step === "connectEmail" && agent && (
        <ConnectEmailMission
          eyebrow={stepEyebrow("connectEmail")}
          agent={agent}
          onBack={() => setStep("meet")}
          onConnected={(toolkit, label) => {
            // Capture which email the user connected (connect doesn't route
            // through the AI card, so the global tracker wouldn't see it).
            analytics.track("integration_connected", {
              integration_slug: toolkit,
            });
            setEmailTool({ toolkit, label });
            setStep("emailConnected");
          }}
          onSkip={skipEmailSteps}
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
          onSkip={() => skipOnboarding("emailChat")}
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
          onTour={() => finishOnboarding("tour")}
          onConnectMore={() => finishOnboarding("integrations")}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </>
  );
}
