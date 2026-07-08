import { IntegrationConnectCard } from "./integration-connect-card";

interface ChatConnectInteractionCardProps {
  /** The `#houston_toolkit=<slug>` app the agent asked the user to connect. */
  toolkit: string;
  /** The agent whose chat hosts the card (multiplayer grant attribution). */
  agentId: string;
  /** Multiplayer: auto-grant the fresh connection to this agent (C4). */
  autoGrant: boolean;
  /** Why the agent needs the connection, surfaced above the card when present. */
  reason?: string;
  /** Fired once when the connection the user drove from here lands — the panel
   *  nudges the agent to resume (reuses the auto-continue path). */
  onConnected: (toolkit: string, appName: string) => void;
}

/**
 * The connect-step content for a `request_connection` interaction, rendered
 * INSIDE the shared {@link ChatInteractionCard} sequence (via its
 * `renderConnect` prop). The interaction card owns the surface, progress, and
 * back affordance; this wrapper only supplies the reason line plus the SAME
 * rich {@link IntegrationConnectCard} the inline `#houston_toolkit` link
 * renders. Once the connection lands the sequence advances through
 * `onConnected`, so this content retires via the card's own reactivity. When the
 * toolkit is ALREADY connected there is no Connect button to drive, so
 * `autoContinueWhenConnected` lets the card self-report and advance the sequence
 * instead of soft-locking (the queued question answers would never be sent).
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  autoGrant,
  reason,
  onConnected,
}: ChatConnectInteractionCardProps) {
  return (
    <div className="flex flex-col gap-2">
      {reason && <p className="text-sm text-foreground">{reason}</p>}
      <IntegrationConnectCard
        toolkit={toolkit}
        agentId={agentId}
        autoGrant={autoGrant}
        onConnected={onConnected}
        autoContinueWhenConnected
        surface="secondary"
      />
    </div>
  );
}
