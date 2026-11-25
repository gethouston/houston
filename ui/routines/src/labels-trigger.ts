/** Human copy for each live trigger status (C9). Never technical. */
export interface TriggerStatusLabels {
  active: string;
  pending: string;
  paused_disconnected: string;
  paused_revoked: string;
  error: string;
}

/**
 * What an event-trigger routine says once it exists: the plain-language "wakes
 * on an event" summary fallback and the live status badge (incl. its one-click
 * recovery). All human, never "webhook"/"schema"/"instance". Picking the app and
 * choosing the exact event happen in the setup chat, not a wizard form, so
 * this carries no picker/config-form copy.
 */
export interface TriggerLabels {
  /** Generic "wakes on an event" fallback, shown when an event-driven routine
   *  has no humanized event summary yet. */
  wakeEvent: string;
  /** Status badge + its one-click recovery. */
  status: TriggerStatusLabels;
  /** Muted chip shown while a trigger routine has no status data yet — never a
   *  healthy look. Never reads as "off" either; the status is simply unknown. */
  statusUnknown: string;
  /** Idle line for an active trigger routine that has not fired yet (no runs). */
  waitingFirstEvent: string;
  reconnect: string;
  statusDisconnectedHint: string;
  statusRevokedHint: string;
}
