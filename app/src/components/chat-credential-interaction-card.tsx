import {
  InlineTextRow,
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
} from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, CornerDownLeft, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentCustomIntegrations,
  useSubmitCustomCredential,
} from "../hooks/queries";
import { useUIStore } from "../stores/ui";
import { ChatStepDeclineButton } from "./chat-step-decline-button";
import { CustomCredentialForm } from "./integrations/custom-credential-form";
import { customAuthMethod } from "./integrations/custom-integrations-model";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

interface ChatCredentialInteractionCardProps extends StepChrome {
  /** The credential step's stable id — fades the modal body on a step swap and
   *  scopes the form id so parallel credential steps never collide. */
  stepId: string;
  /** The agent whose chat raised this step. Both the list read and the save
   *  ride the per-agent surface (HOU-823) — the ONE route a gateway-fronted
   *  deployment proxies to the agent's pod; the top-level form 404s at the
   *  gateway, which failed every managed-cloud save. */
  agentId: string;
  /** The custom integration's slug the agent asked the user to credential. */
  toolkit: string;
  /** Why the agent needs the key, rendered as the body's foreground "why" line.
   *  When absent it falls back to "Add your {name} key". */
  reason?: string;
  /** Fired once the secret is stored — the panel records the integration's name
   *  and advances; the composed reply resumes the agent at the LAST step. */
  onSaved: (name: string) => void;
  /** Fired when the user declines this credential step: "Skip" (live frontier or
   *  a reconsidered skip) passes no `message`; typing an instruction into the
   *  free-text row and sending passes that verbatim text. The panel records the
   *  decline (with the message, if any, so the composed reply relays it) then
   *  advances. */
  onSkip: (name: string, message?: string) => void;
  /** True when the user walked BACK onto this already-reached step via the pager.
   *  A revisited step whose key is saved shows the calm saved state with no
   *  footer (the pager's forward chevron is the way onward); a revisited SKIPPED
   *  step keeps its Save CTA (and its paired Skip) so the user can reconsider. */
  revisited: boolean;
}

/**
 * The credential-step content for a `request_credential` interaction, rendered as
 * its OWN `InteractionModal` inside the shared `ChatInteractionCard` sequence
 * (via its `renderCredential` prop, wired with the `StepChrome` the stepper hands
 * it — the header pager + dismiss X), so it reads as a first-class sibling of the
 * connect/signin/approval cards. The modal TITLE is the identity lockup — a key
 * glyph beside the integration NAME at regular weight — and the body is the
 * agent's REASON in foreground tone ("Add your Acme key") over a muted
 * reassurance line, then the secure key {@link CustomCredentialForm} whose secret
 * goes straight to the host's store, NEVER the chat transcript. A right-aligned
 * footer carries the unified quiet "Skip" + Esc hint beside the single filled
 * "Save key" pill (with a return-key glyph).
 *
 * Enter saves (native form submit from the focused key field), Esc declines
 * (matching the footer hints). The header pager owns Back/Forward, so a REVISITED
 * step needs no navigation button of its own: already saved -> the calm "Key
 * saved" state and no footer; skipped -> the Save CTA (and its paired "Skip")
 * return so the user can reconsider. "Skip" travels WITH the Save CTA so the
 * decline affordance is present wherever saving is offered — a key is optional
 * exactly like a connection, never a dead-end the user cannot leave.
 *
 * On success the mutation's `call()` wrapper stays silent, a success (or
 * saved-but-unverified) toast fires here, and `onSaved` advances the sequence.
 * On failure that wrapper already toasts + reports, and `isPending` clears so the
 * Save button re-enables — no silent failure, no infinite spinner.
 */
export function ChatCredentialInteractionCard({
  stepId,
  agentId,
  toolkit,
  reason,
  onSaved,
  onSkip,
  revisited,
  pager,
  onDismiss,
  dismissLabel,
  disabled,
}: ChatCredentialInteractionCardProps) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const list = useAgentCustomIntegrations(agentId);
  const submit = useSubmitCustomCredential(agentId);
  const [ready, setReady] = useState(false);

  const view = list.data?.find((v) => v.slug === toolkit);
  const name = view?.name ?? toolkit;
  const authMethod = view ? customAuthMethod(view) : null;
  // The integration flips to "active" once its key is stored; on a revisit that
  // marks the step done, so it shows the calm saved state instead of re-prompting.
  const isSaved = revisited && view?.state.status === "active";
  const reasonLine = reason ?? t("credential.title", { name });
  const formId = `credential-form-${stepId}`;

  const onSubmit = (values: Record<string, string>) => {
    submit.mutate(
      { slug: toolkit, values },
      {
        onSuccess: (saved) => {
          // `verified === false` means the key SAVED but the service's probe
          // rejected it: warn instead of celebrating, and still resume the
          // agent — it can test the integration and re-request if calls fail.
          addToast(
            saved.verified === false
              ? {
                  title: t("credential.savedUnverifiedToast", { name }),
                  variant: "info",
                }
              : {
                  title: t("credential.savedToast", { name }),
                  variant: "success",
                },
          );
          onSaved(name);
        },
      },
    );
  };

  // Esc declines (mirroring the footer hint). Enter saves via the field's native
  // form submit; the shared hook's editable-target guard keeps the real composer
  // untouched and pre-empts the global Escape-closes-the-panel shortcut. Inert
  // while a save is in flight and on the calm saved state.
  useInteractionStepKeys({
    enabled: !submit.isPending && !isSaved,
    onEscape: () => onSkip(name),
  });

  return (
    <InteractionModal
      contentKey={stepId}
      disabled={disabled}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      pager={pager}
      title={
        <InteractionModalTitle
          className="flex-1 truncate"
          icon={<KeyRound className="size-4 shrink-0 text-ink-muted" />}
        >
          {name}
        </InteractionModalTitle>
      }
      body={
        isSaved ? (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 text-sm dark:text-emerald-400">
            <Check className="size-3.5" />
            {t("credential.saved")}
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-balance text-ink text-sm leading-snug">
              {reasonLine}
            </p>
            <p className="text-ink-muted text-sm">{t("credential.subtitle")}</p>
            <div className="mt-1.5">
              <CustomCredentialForm
                authMethod={authMethod}
                submitting={submit.isPending}
                onSubmit={onSubmit}
                submitLabel={t("credential.save")}
                submittingLabel={t("credential.saving")}
                autoFocus
                formId={formId}
                hideSubmit
                onReadyChange={setReady}
              />
            </div>
            {/* Save the key, or tell it what to do instead. */}
            <InlineTextRow
              disabled={submit.isPending}
              onSubmit={(text) => onSkip(name, text)}
              placeholder={t("interaction.declinePlaceholder")}
              sendLabel={t("questionCard.send")}
            />
          </div>
        )
      }
      footer={
        isSaved ? undefined : (
          <>
            <ChatStepDeclineButton
              disabled={submit.isPending}
              escLabel={t("interaction.esc")}
              label={t("interaction.skip")}
              onClick={() => onSkip(name)}
            />
            <Button
              className="gap-1.5"
              disabled={!ready || submit.isPending}
              form={formId}
              size="sm"
              type="submit"
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("credential.saving")}
                </>
              ) : (
                <>
                  {t("credential.save")}
                  <CornerDownLeft className="size-3.5 opacity-70" />
                </>
              )}
            </Button>
          </>
        )
      }
    />
  );
}
