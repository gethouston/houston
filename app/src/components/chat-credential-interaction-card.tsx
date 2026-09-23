import type { StepChrome } from "@houston-ai/chat";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { CredentialStepCta } from "./chat-credential-step-cta";
import {
  CredentialStepFields,
  CredentialStepIcon,
} from "./chat-credential-step-fields";
import { useChatCredentialStep } from "./use-chat-credential-step";

interface ChatCredentialInteractionCardProps extends StepChrome, StepDraftApi {
  /** The credential step's stable id — fades the modal body on a step swap and
   *  scopes the form id so parallel credential steps never collide. */
  stepId: string;
  /** The agent whose chat raised this step. */
  agentId: string;
  /** The custom integration's slug the agent asked the user to credential. */
  toolkit: string;
  /** Why the agent needs the key, rendered as the body's foreground "why" line.
   *  When absent it falls back to "Add your {name} key". */
  reason?: string;
  /** Fired once the secret is stored (or, for a sign-in integration, once the
   *  browser flow landed) — the panel records the integration's name + mode
   *  and advances; the composed reply resumes the agent at the LAST step. */
  onSaved: (name: string, mode: "key" | "oauth") => void;
  /** Fired when the user declines this credential step: "Skip" (live frontier or
   *  a reconsidered skip) passes no `message`; typing an instruction into the
   *  free-text row and sending passes that verbatim text. The panel records the
   *  decline (with the message, if any, so the composed reply relays it) then
   *  advances. */
  onSkip: (name: string, mode: "key" | "oauth", message?: string) => void;
  /** True when the user walked BACK onto this already-reached step via the pager.
   *  A revisited step whose key is saved shows the calm saved state with no
   *  footer (the pager's forward chevron is the way onward); a revisited SKIPPED
   *  step keeps its Save CTA (and its paired Skip) so the user can reconsider. */
  revisited: boolean;
}

/**
 * The credential-step content for a `request_credential` interaction, rendered
 * through the shared {@link ChatConnectStepShell} inside the `ChatInteractionCard`
 * sequence (via its `renderCredential` prop) so it reads as a first-class sibling
 * of the connect/signin cards. The TITLE is the integration's favicon (or a key /
 * sign-in glyph) beside its NAME; the body is the agent's REASON over a muted
 * reassurance line and the secure key form (`CustomCredentialForm`), whose secret
 * goes straight to the host's store, NEVER the chat transcript.
 *
 * Enter saves (native form submit from the focused key field), Esc declines. A
 * saved step shows the calm "Key saved" line with no way to act on it; a
 * revisited SKIPPED step keeps its Save CTA so the user can reconsider — a key is
 * optional exactly like a connection, never a dead-end the user cannot leave.
 *
 * On success the mutation's `call()` wrapper stays silent, a success (or
 * saved-but-unverified) toast fires from {@link useChatCredentialStep}, and
 * `onSaved` advances the sequence. On failure that wrapper already toasts +
 * reports, and `isPending` clears so the Save button re-enables — no silent
 * failure, no infinite spinner.
 */
export function ChatCredentialInteractionCard({
  stepId,
  agentId,
  toolkit,
  reason,
  onSaved,
  onSkip,
  revisited,
  ...chrome
}: ChatCredentialInteractionCardProps) {
  const { t } = useTranslation("chat");
  const step = useChatCredentialStep({ agentId, toolkit, revisited, onSaved });
  const [ready, setReady] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const formId = `credential-form-${stepId}`;

  return (
    <ChatConnectStepShell
      {...chrome}
      busy={step.busy}
      cta={
        <CredentialStepCta
          formId={formId}
          missing={step.missing}
          mode={step.mode}
          onSignIn={step.startSignIn}
          ready={ready}
          retry={step.retry}
          signInPending={step.signInPending}
          submitting={step.submitting}
        />
      }
      done={step.isSaved}
      doneLabel={t(step.oauth ? "credential.signedIn" : "credential.saved")}
      icon={
        <CredentialStepIcon
          iconUrl={iconFailed ? null : step.iconUrl}
          mode={step.mode}
          onIconError={() => setIconFailed(true)}
        />
      }
      // Enter saves via the key field's native form submit, so no `onEnter`.
      onDecline={(text) => onSkip(step.name, step.mode, text)}
      reason={
        step.missing
          ? t("credential.missingBody", { name: step.name })
          : (reason ??
            t(step.oauth ? "credential.signInTitle" : "credential.title", {
              name: step.name,
            }))
      }
      stepId={stepId}
      title={step.name}
    >
      <CredentialStepFields
        authMethod={step.authMethod}
        awaitingGrant={step.awaitingGrant}
        blockedUrl={step.blockedUrl}
        formId={formId}
        missing={step.missing}
        mode={step.mode}
        onOpenBlocked={step.openBlocked}
        onReadyChange={setReady}
        onSubmit={step.save}
        signInFailed={step.signInFailed}
        submitting={step.submitting}
      />
    </ChatConnectStepShell>
  );
}
