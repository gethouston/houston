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
import { IntroMission } from "./missions/intro";
import { MeetMission } from "./missions/meet";
import { BrainMission } from "./missions/brain";
import { ProviderLoginMission } from "./missions/provider-login";
import { ToolsMission } from "./missions/tools";
import { EmailMission } from "./missions/email";
import { SuccessMission } from "./success-mission";
import { createPersonalAssistantForWorkspace } from "./create-personal-assistant";
import { ensureWorkspaceWithAssistant } from "./ensure-default-assistant";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts";
import { TUTORIAL_MISSION } from "./personal-assistant-missions";
import { type OnboardingStep, type TutorialStep } from "./tutorial-copy";
import { setupStepNumber, type SetupStep } from "../../lib/setup-steps";

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
  // Set while the "create your first agent" step is provisioning the
  // workspace + assistant, to drive the button's loading state.
  const [creatingAgent, setCreatingAgent] = useState(false);
  // Recipient label of the first email, shown on the final success screen.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [assistantName, setAssistantName] = useState(() =>
    t("setup:tutorial.defaults.assistantName"),
  );
  const [assistantColor, setAssistantColor] = useState("navy");
  // Collapses concurrent / repeated default-workspace creation onto a single
  // in-flight operation so first-run can never fire `createWorkspace` twice
  // (a double-clicked Continue, Skip racing a mission) — HOU-444.
  const creationRef = useRef<Promise<Agent> | null>(null);

  // Title stamped on the agent's first-run instructions — the one task setup
  // walks the user through.
  const missionTitle = t("setup:tutorial.missions.email.chip");

  // `tutorialActive` pins the orchestrator in front of the workspace shell so
  // the workspace-create event in the Brain step doesn't unmount us. Welcome +
  // the agreement now run in the first-run gate BEFORE the app renders this, so
  // by the time onboarding mounts (post-load, `workspaces.length === 0`) the
  // user is genuinely starting setup — safe to pin on mount.
  useEffect(() => {
    analytics.track("onboarding_started", { source: "setup" });
    setTutorialActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createWorkspaceAndAssistant = (
    pickedProvider: string,
    pickedModel: string,
  ): Promise<Agent> => {
    // Reuse an in-flight creation rather than starting a second one, so a
    // double-clicked Continue (or a Skip racing a mission) can't fire two
    // `createWorkspace("Personal")` calls and trip the engine's dup-name
    // conflict (HOU-444).
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

      // Get-or-create: a prior partial run (or an orchestrator remount) may
      // have already created "Personal" and/or its assistant. Reuse them
      // instead of re-creating, which the engine rejects as a duplicate.
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

      // Persist the picked pair as the new global default so the next new
      // agent starts from the same place the user just chose during onboarding.
      await tauriProvider.setLastUsed(pickedProvider, pickedModel);
      // Count activation only for a genuinely new workspace — a reused one
      // (retry / remount) must not double-fire the event.
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
    // If it fails partway, drop the memo so a retry re-runs the (now
    // idempotent) get-or-create instead of being stuck on a rejected promise.
    op.catch(() => {
      creationRef.current = null;
    });
    return op;
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

  // The "create your first agent" step now owns provisioning the workspace +
  // assistant (it used to live on the provider-login Continue, but creation now
  // happens AFTER the AI + apps setup phase). By here provider/model are picked
  // and the user has just chosen the name/color on this step. Reused creation
  // is deduped inside createWorkspaceAndAssistant (HOU-444); on failure we toast
  // and stay so the user can retry.
  const handleCreateAgent = async () => {
    if (!provider || !model) return;
    setCreatingAgent(true);
    try {
      // Funnel: the user named + created their first agent.
      analytics.track("onboarding_assistant_named");
      await createWorkspaceAndAssistant(provider, model);
      setCreatingAgent(false);
      setStep("email");
    } catch (err) {
      addToast({
        title: t("setup:tutorial.errors.setupFailed"),
        description: String(err),
        variant: "error",
      });
      setCreatingAgent(false);
    }
  };

  // Provider/model the back-half missions (Try, Routine) run against. The
  // user picks these in the Brain mission; fall back to the platform default
  // model for the chosen provider if a mission renders before a pick.
  const missionProvider = provider ?? "anthropic";
  const missionModel = model ?? getDefaultModel(missionProvider);

  // One shared step counter across the whole setup (language + agreement +
  // these), so every screen's "Step N of N" agrees.
  const stepEyebrow = (s: TutorialStep) =>
    t("setup:tutorial.counter", setupStepNumber(s as SetupStep));

  return (
    <>
      {step === "intro" && (
        <IntroMission onContinue={() => setStep("brain")} />
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
          onContinue={() => setStep("tools")}
        />
      )}
      {step === "tools" && (
        <ToolsMission
          eyebrow={stepEyebrow("tools")}
          onBack={() => setStep("providerLogin")}
          onContinue={() => setStep("setupReady")}
        />
      )}
      {step === "setupReady" && (
        <SuccessMission
          title={t("setup:tutorial.missions.setupReady.title")}
          body={t("setup:tutorial.missions.setupReady.body")}
          ctaLabel={t("setup:tutorial.missions.setupReady.cta")}
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
      {step === "email" && agent && (
        <EmailMission
          eyebrow={stepEyebrow("email")}
          agent={agent}
          assistantColor={assistantColor}
          provider={missionProvider}
          model={missionModel}
          onBack={() => setStep("meet")}
          onContinue={(to) => {
            setSentTo(to ?? null);
            setStep("done");
          }}
          onSkip={finishOnboarding}
        />
      )}
      {step === "done" && (
        <SuccessMission
          title={t("setup:tutorial.missions.done.title")}
          body={t("setup:tutorial.missions.done.body", {
            recipient:
              sentTo ?? t("setup:tutorial.missions.email.recipient.youLabel"),
          })}
          ctaLabel={t("setup:tutorial.missions.done.cta")}
          onContinue={finishOnboarding}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </>
  );
}
