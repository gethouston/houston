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
 * The composer-replacing surface for a `request_connection` interaction: the
 * agent's turn ended asking the user to connect an app, so the whole composer
 * is taken over by the reason plus the SAME rich {@link IntegrationConnectCard}
 * the inline `#houston_toolkit` link renders. Once the connection lands the
 * turn resumes through `onConnected` (the auto-continue nudge) and the SDK
 * clears the interaction, so this card disappears via the same reactivity.
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  autoGrant,
  reason,
  onConnected,
}: ChatConnectInteractionCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {reason && <p className="text-sm text-foreground">{reason}</p>}
      <IntegrationConnectCard
        toolkit={toolkit}
        agentId={agentId}
        autoGrant={autoGrant}
        onConnected={onConnected}
      />
    </div>
  );
}
