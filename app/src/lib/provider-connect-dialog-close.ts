export type ProviderConnectDialogKind =
  | "apiKey"
  | "copilot"
  | "localModel"
  | "login";

export type ProviderConnectDialogClose = "completed" | "dismissed";

const SELF_COMPLETING: readonly ProviderConnectDialogKind[] = [
  "apiKey",
  "copilot",
  "localModel",
];

export function closeMeansCancel(
  kind: ProviderConnectDialogKind,
  close: ProviderConnectDialogClose,
): boolean {
  return !(close === "completed" && SELF_COMPLETING.includes(kind));
}
