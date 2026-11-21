import { refusalCode, refusalStatus } from "../refusal-code";

export interface WebhookKeyViewer {
  createdBy: string | undefined;
  viewerId: string | null | undefined;
  ownsSpace: boolean | undefined;
}

export type WebhookKeyAccess =
  | "allowed"
  | "not_creator"
  | "not_owner"
  | "unknown";

export function webhookKeyAccess(viewer: WebhookKeyViewer): WebhookKeyAccess {
  if (viewer.createdBy) {
    if (!viewer.viewerId) return "unknown";
    return viewer.createdBy === viewer.viewerId ? "allowed" : "not_creator";
  }
  if (viewer.ownsSpace === undefined) return "unknown";
  return viewer.ownsSpace ? "allowed" : "not_owner";
}

export const WEBHOOK_KEY_NOT_CREATOR = "not_creator";

export function isWebhookKeyNotCreatorRefusal(error: unknown): boolean {
  if (!(error instanceof Error) || refusalStatus(error) !== 403) return false;
  return refusalCode(error) === WEBHOOK_KEY_NOT_CREATOR;
}
