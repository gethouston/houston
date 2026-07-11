import { IntegrationCredentialCard } from "./integration-credential-card";

interface ChatCredentialInteractionCardProps {
  /** The custom integration's slug the agent asked the user to credential. */
  toolkit: string;
  /** Why the agent needs the key, surfaced above the card when present. */
  reason?: string;
  /** Fired once the secret is stored — the sequence advances and, on the last
   *  step, resumes the agent with the saved integration's display name. */
  onSaved: (name: string) => void;
}

/**
 * The credential-step content for a `request_credential` interaction, rendered
 * INSIDE the shared {@link ChatInteractionCard} sequence (via its
 * `renderCredential` prop). The interaction card owns the surface, progress, and
 * back affordance; this thin wrapper hands the reason + slug to the secure
 * {@link IntegrationCredentialCard}, which draws the Mercury title/subtitle
 * lockup + form. Once the secret is saved the sequence advances through
 * `onSaved` — mirrors {@link ChatConnectInteractionCard}.
 */
export function ChatCredentialInteractionCard({
  toolkit,
  reason,
  onSaved,
}: ChatCredentialInteractionCardProps) {
  return (
    <IntegrationCredentialCard
      toolkit={toolkit}
      reason={reason}
      onSaved={onSaved}
    />
  );
}
