import { type Toast, ToastContainer } from "@houston-ai/core";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useOnboardingCompleted } from "../../hooks/use-onboarding-completed";
import { useOnboardingPending } from "../../hooks/use-onboarding-pending";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import { getDefaultModel } from "../../lib/providers";
import { stepPosition } from "../../lib/setup-steps";
import { useUIStore } from "../../stores/ui";
import { SpaceScreen } from "../space/space-screen";
import { ConnectAiMission } from "./missions/connect-ai";
import { ConnectEmailMission } from "./missions/connect-email";
import { EmailMission } from "./missions/email";
import { FinishedMission } from "./missions/finished";
import {
  integrationsAvailable,
  stepAfterAgentCreated,
} from "./missions/onboarding-flow";
import { TUTORIAL_MISSION } from "./personal-assistant-missions";
import { SetupCard } from "./setup-card";
import { type Milestone, SetupProgress } from "./setup-progress";
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
  const addToast = useUIStore((s) => s.addToast);
  const [step, setStep] = useState<OnboardingStep>("connect");
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  // Background assistant provisioning failed (create() threw). Flips the stuck
  // `connectEmail` spinner into a recoverable error state instead of an infinite
  // hold (see the connectEmail branch below).
  const [createFailed, setCreateFailed] = useState(false);
  // The background provisioning has held the spinner past its patience window
  // (promise never settled). Surfaces the same Try-again affordance as an
  // outright failure so a hung create can't strand the user forever.
  const [waitTimedOut, setWaitTimedOut] = useState(false);
  // The assistant actually SENT a real email (only the full email path sets it).
  // Drives the honest finished-screen variant: no-integrations finishes must not
  // claim an email was sent.
  const [emailSent, setEmailSent] = useState(false);
  // The email toolkit connected in the "give access to your email" step.
  const [emailTool, setEmailTool] = useState<{
    toolkit: string;
    label: string;
  } | null>(null);

  // Houston ships ONE great default Personal Assistant — no naming/color step.
  // These are fixed, computed once, and fed straight into creation.
  const assistantName = t("setup:tutorial.defaults.assistantName");
  const assistantColor = "navy";

  // The email detour only works where the host serves the integrations routes;
  // App has already awaited capabilities load before mounting us, so this is
  // resolved (null only on the legacy Rust engine → straight to finish).
  const { capabilities } = useCapabilities();

  // Capability-aware step math: on a no-integrations deployment the email steps
  // never render, so they must vanish from BOTH the "Step N of M" counter and
  // the celebration plan (else the sole connect step lies "Step 1 of 3").
  const emailSteps = integrationsAvailable(capabilities);
  const visibleMilestones: Milestone[] = emailSteps
    ? ["ai", "email", "send"]
    : ["ai"];

  const { agent, creating, create } = useCreateAssistant({
    assistantName,
    assistantColor,
  });

  // Persisted "onboarding is mid-flight" flag (mirrors the legal-acceptance
  // engine preference). Because the assistant is created SILENTLY the instant
  // the AI connects, the agent-count first-run signal (App.tsx) fires `false`
  // forever after that point — so quitting mid-flow would permanently skip the
  // rest of setup. The flag is the durable resume contract: SET on mount (below,
  // the flow has begun), CLEARED in every terminal path (`finishOnboarding` and
  // the `skipConversation` exit). App.tsx re-enters onboarding while it's set.
  const { markPending, clearPending } = useOnboardingPending();

  // Durable "onboarding is behind us" flag, set on every terminal path below
  // (finish + skip) alongside the pending clear. Once set, a later zero-agent
  // workspace reads as emptied — not a fresh install — so App.tsx keeps the
  // user in the shell instead of re-entering onboarding.
  const { markCompleted } = useOnboardingCompleted();

  // `tutorialActive` pins the orchestrator in front of the workspace shell so
  // the workspace-create event in the create step doesn't unmount us.
  useEffect(() => {
    analytics.track("onboarding_started", { source: "setup" });
    setTutorialActive(true);
    // Arm the durable resume flag: the flow has begun. Cleared only on a
    // terminal path; if the user quits before then, App.tsx re-enters here.
    void markPending();
  }, [setTutorialActive, markPending]);

  // Fire one step-viewed event per screen reached so a single funnel shows
  // exactly where people drop off. Guarded so re-renders / Back don't refire.
  const viewedSteps = useRef(new Set<string>());
  // The once-per-install "ai_provider_connected" funnel event fires on the first
  // successful connect only; a Back → reconnect must not re-emit it.
  const aiConnectedTracked = useRef(false);
  useEffect(() => {
    if (!viewedSteps.current.has(step)) {
      viewedSteps.current.add(step);
      analytics.track("onboarding_step_viewed", { step });
    }
  }, [step]);

  // Safety net for the connectEmail spinner hold: if the background create never
  // settles (promise stuck), a bare spinner would trap the user. After 20s,
  // surface the same Try-again affordance as an outright failure. Only armed
  // while actually waiting (on connectEmail, agent not yet landed, no error).
  useEffect(() => {
    if (step !== "connectEmail" || agent || createFailed) {
      setWaitTimedOut(false);
      return;
    }
    const id = setTimeout(() => setWaitTimedOut(true), 20_000);
    return () => clearTimeout(id);
  }, [step, agent, createFailed]);

  // Terminal hand-off. Arm the UI tour BEFORE clearing `tutorialActive` so the
  // workspace shell mounts with the tour overlay already up — no flicker.
  // The tour itself owns the final landing: its Routines step demos the
  // freshly-seeded Morning briefing, and its completion/skip callback lands on
  // the Routines tab (see workspace-shell). We do NOT set `viewMode` here — the
  // tour's first step immediately switches it, so a set here would only flash
  // and be overwritten. Also clear the resume flag: this is a terminal path.
  const finishOnboarding = () => {
    analytics.track("onboarding_completed", {
      mission: TUTORIAL_MISSION.id,
      integrations_skipped: false,
      tutorial_run: true,
      source: "tour",
    });
    void clearPending();
    void markCompleted();
    setUiTourActive(true);
    setTutorialActive(false);
  };

  // Kick off workspace + assistant provisioning the INSTANT the AI connects, so
  // the record is ready by the time the user clicks through the celebration to
  // the email step. Uses the JUST-received provider/model (state setters haven't
  // flushed yet). `create` dedupes concurrent calls, so this is safe to fire
  // eagerly. Per the no-silent-failure policy, a failure surfaces a toast (the
  // stranded user is exactly the bug we want reported) AND flips `createFailed`
  // so the connectEmail step renders a recoverable error instead of an infinite
  // spinner. Clearing both flags up front makes this double as the retry path.
  const createAssistantOnConnect = async (p: string, m: string) => {
    setCreateFailed(false);
    setWaitTimedOut(false);
    try {
      await create(p, m);
    } catch (err) {
      setCreateFailed(true);
      addToast({
        title: t("setup:tutorial.errors.setupFailed"),
        description: genericErrorDescription("onboarding_create_agent", err),
        variant: "error",
      });
    }
  };

  // Retry after a failed / hung background create. Re-fires with the stored
  // provider/model (both are set by the time the connectEmail step shows). If
  // somehow they're missing, send the user Back to re-pick a provider rather
  // than fire a create with no inputs.
  const retryCreate = () => {
    if (!provider || !model) {
      setStep("connect");
      return;
    }
    void createAssistantOnConnect(provider, model);
  };

  // Provider/model the email send runs against (fall back to the default).
  const missionProvider = provider ?? "anthropic";
  const missionModel = model ?? getDefaultModel(missionProvider);

  // After the first message begins the AI conversation, the user can leave
  // onboarding and start using Houston. This is not a completion, so analytics
  // preserves it as a conversation exit instead of a completed email mission.
  const skipConversation = (fromStep: OnboardingStep) => {
    analytics.track("onboarding_skipped", {
      step: fromStep,
      provider: missionProvider,
      model: missionModel,
      source: "conversation",
    });
    // Terminal conversation exit: clear the resume flag so the next boot
    // does not return the user to onboarding, and mark onboarding completed.
    void clearPending();
    void markCompleted();
    setTutorialActive(false);
  };

  // Flat step eyebrow: "Step 1 of 3". Empty for screens that aren't numbered
  // steps (never rendered on those).
  const stepEyebrow = (screen: string): string => {
    const s = stepPosition(screen, { emailSteps });
    if (!s) return "";
    return t("setup:tutorial.stepCounter", {
      current: s.current,
      total: s.total,
    });
  };

  // One SpaceScreen at the top level (not per-step) so the backdrop photo mounts
  // once and never re-fades on a step transition. Every step's SetupCard floats
  // on it via `onSpace`, so onboarding reads as the same continuous space as
  // sign-in and the workspace-loading splash.
  return (
    <SpaceScreen>
      {step === "connect" && (
        <ConnectAiMission
          eyebrow={stepEyebrow("connect")}
          onConnected={(p, m) => {
            // Once-per-install onboarding funnel step (production-infra.md).
            // Ref-guarded so a Back → reconnect can't double-fire it.
            if (!aiConnectedTracked.current) {
              aiConnectedTracked.current = true;
              analytics.track("ai_provider_connected", { provider: p });
            }
            setProvider(p);
            setModel(m);
            // Provision the default assistant NOW, in the background, from the
            // just-received pick — no naming step, no user-triggered button.
            void createAssistantOnConnect(p, m);
            setStep("aiConnected");
          }}
        />
      )}
      {step === "aiConnected" && (
        <SetupProgress
          title={t("setup:tutorial.missions.aiConnected.title")}
          message={t("setup:tutorial.missions.aiConnected.body")}
          done={["ai"]}
          items={visibleMilestones}
          justCompleted="ai"
          ctaLabel={t("setup:tutorial.missions.aiConnected.cta")}
          onContinue={() => setStep(stepAfterAgentCreated(capabilities))}
        />
      )}

      {step === "connectEmail" &&
        (agent ? (
          <ConnectEmailMission
            eyebrow={stepEyebrow("connectEmail")}
            agent={agent}
            onBack={() => setStep("aiConnected")}
            onConnected={(toolkit, label) => {
              // Capture which email the user connected (connect doesn't route
              // through the AI card, so the global tracker wouldn't see it).
              analytics.track("integration_connected", {
                integration_slug: toolkit,
              });
              setEmailTool({ toolkit, label });
              setStep("emailConnected");
            }}
          />
        ) : createFailed || waitTimedOut ? (
          // Background provisioning failed or hung: recoverable error, not an
          // infinite spinner. Retry re-fires the create with the stored pick
          // (disabled while a retry is in flight); Back returns to the AI picker
          // so they can also choose a different provider.
          <SetupCard
            onSpace
            eyebrow={stepEyebrow("connectEmail")}
            title={t("setup:tutorial.errors.title")}
            subtitle={t("setup:tutorial.errors.body")}
            onBack={() => setStep("connect")}
            backLabel={t("setup:tutorial.nav.back")}
            onNext={retryCreate}
            nextLabel={t("setup:tutorial.errors.retry")}
            nextDisabled={creating}
            nextLoading={creating}
          >
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <AlertTriangle className="size-8 text-ink-muted" />
            </div>
          </SetupCard>
        ) : (
          // The user clicked through the celebration faster than the background
          // provisioning resolved. Hold on a light loading state and advance
          // automatically the instant the agent record lands. Keep the step
          // eyebrow so "Step 2 of 3" doesn't vanish during the wait.
          <SetupCard onSpace eyebrow={stepEyebrow("connectEmail")}>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="size-6 animate-spin text-ink-muted" />
              <p className="text-sm text-ink-muted">
                {t("setup:tutorial.missions.connectEmail.preparing")}
              </p>
            </div>
          </SetupCard>
        ))}
      {step === "emailConnected" && (
        <SetupProgress
          title={t("setup:tutorial.missions.emailConnected.title")}
          message={t("setup:tutorial.missions.emailConnected.body")}
          done={["ai", "email"]}
          items={visibleMilestones}
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
          onContinue={() => {
            // The only path that genuinely sent a real email — mark it so the
            // finished screen can honestly claim the send.
            setEmailSent(true);
            setStep("finished");
          }}
          onSkip={() => skipConversation("emailChat")}
        />
      )}

      {step === "finished" && (
        <FinishedMission
          variant={emailSent ? "sent" : "ready"}
          onStart={finishOnboarding}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </SpaceScreen>
  );
}
