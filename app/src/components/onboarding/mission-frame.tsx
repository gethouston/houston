/**
 * Shared metadata shape for a setup step. The card steps now render through
 * `SetupCard`; this type survives because the email step's `MissionChatFrame`
 * and `buildMissionMeta` still describe a step with it.
 */
export interface MissionMeta {
  index: number;
  total: number;
  eyebrow: string;
  title: string;
  body: string;
  nextTitle: string | null;
}
