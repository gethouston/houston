export interface TriggerStatusLabels {
  active: string;
  pending: string;
  paused_disconnected: string;
  paused_revoked: string;
  error: string;
}

export interface TriggerLabels {
  wakeEvent: string;
  status: TriggerStatusLabels;
  statusUnknown: string;
  waitingFirstEvent: string;
  reconnect: string;
  statusDisconnectedHint: string;
  statusRevokedHint: string;
}
