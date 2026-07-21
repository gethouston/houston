import type { StepChrome } from "@houston-ai/chat";
import { InteractionModal, InteractionModalTitle } from "@houston-ai/chat";
import { Button, Spinner } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";
import { AppLogo } from "../../integrations/app-logo";
import { useUsableToolkits } from "../use-usable-toolkits";
import { ConnectInline } from "./connect-inline";
import { IntakeTriggerSelected } from "./intake-trigger-selected";
import { TriggerAppGrid } from "./trigger-app-grid";
import type { TriggerPick } from "./types";
import { useTriggerStep } from "./use-trigger-step";

interface IntakeTriggerCardProps {
  /** The agent the trigger is scoped to (its connections + allowlist). */
  agent: Agent;
  /** The stepper chrome (pager + dismiss X) the intake hands this re-hosted
   *  step so it renders the SAME shell as a real ask_user card. */
  chrome: StepChrome;
  /** Back to the wake question (this card is only reachable via that choice). */
  onBack: () => void;
  /** Commit the assembled trigger and complete the intake. */
  onComplete: (pick: TriggerPick) => void;
}

/**
 * The app-event wake card, re-hosted from the old wizard step into the in-chat
 * {@link InteractionModal} shell. The body walks pick an app → connect it if
 * needed → the app is selected. The user only PICKS THE APP here (and pins the
 * account when it has more than one); WHAT should happen in it is decided later,
 * in plain words, in the AI setup chat. Once the app is selected and its event
 * catalog has loaded in the background, the "Create it" CTA commits the pick.
 */
export function IntakeTriggerCard({
  agent,
  chrome,
  onBack,
  onComplete,
}: IntakeTriggerCardProps): ReactNode {
  const { t } = useTranslation("routines");
  const { apps, connectable, loading } = useUsableToolkits(agent.id, {
    connectable: true,
  });
  const step = useTriggerStep(apps);
  const [query, setQuery] = useState("");

  const build = () => {
    if (step.valid && step.pick) onComplete(step.pick);
  };

  let body: ReactNode = null;
  if (step.phase === "app") {
    body =
      loading && apps.length === 0 && connectable.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-ink-muted text-sm">
          <Spinner className="size-4" />
        </div>
      ) : (
        <TriggerAppGrid
          connected={apps}
          connectable={connectable}
          onQueryChange={setQuery}
          onSelectConnectable={step.pickConnectable}
          onSelectConnected={step.pickConnected}
          query={query}
        />
      );
  } else if (step.phase === "connect" && step.selected) {
    body = (
      <ConnectInline
        agentId={agent.id}
        appName={step.selected.name}
        onBack={step.backToApps}
        onConnected={step.onConnected}
        toolkit={step.selected.toolkit}
      />
    );
  } else if (step.phase === "selected" && step.selected && step.eventApp) {
    body = (
      <IntakeTriggerSelected
        accountId={step.accountId}
        appName={step.selected.name}
        backToApps={step.backToApps}
        catalogError={step.catalogError}
        catalogLoaded={step.catalogLoaded}
        eventApp={step.eventApp}
        retryCatalog={step.retryCatalog}
        setAccountId={step.setAccountId}
      />
    );
  }

  return (
    <InteractionModal
      contentKey={step.phase}
      disabled={chrome.disabled}
      dismissLabel={chrome.dismissLabel}
      onDismiss={chrome.onDismiss}
      pager={chrome.pager}
      title={
        <InteractionModalTitle
          className="truncate"
          icon={
            step.selected ? (
              <AppLogo
                className="shrink-0"
                display={{
                  toolkit: step.selected.toolkit,
                  name: step.selected.name,
                  description: "",
                  logoUrl: step.selected.logoUrl ?? "",
                }}
                size="sm"
              />
            ) : undefined
          }
        >
          {step.selected ? step.selected.name : t("triggerStep.title")}
        </InteractionModalTitle>
      }
      body={
        <div className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm leading-snug">
            {t("wizard.triggerDescription")}
          </p>
          {body}
        </div>
      }
      footer={
        <>
          <Button
            className="gap-1.5 text-ink-muted"
            disabled={chrome.disabled}
            onClick={onBack}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="size-3.5" />
            {t("common:actions.back")}
          </Button>
          {step.phase === "selected" && (
            <Button
              disabled={chrome.disabled || !step.valid}
              onClick={build}
              size="sm"
              type="button"
            >
              {t("wizard.build")}
            </Button>
          )}
        </>
      }
    />
  );
}
