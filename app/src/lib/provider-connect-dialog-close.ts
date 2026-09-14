/**
 * Close semantics for the provider-connect dialog stack.
 *
 * WHY this exists: a connect started from the chat's provider step arms a
 * connection OBSERVER (`useChatProviderConnect`) that watches for fresh auth
 * evidence and resumes the agent when it lands. Cancelling that observer is
 * how an abandoned connect stops the step from resuming — so a dialog that
 * closes BECAUSE the user finished it must never be read as a cancel, or the
 * observer is torn down at the exact moment the sign-in starts and the agent
 * never resumes. Each dialog used to carry its own ad-hoc "did it succeed?"
 * ref, and the Copilot plan dialog carried none at all (it closed itself right
 * after handing the plan back), which is the bug this table replaces.
 */

/** The dialogs in the provider-connect stack that can cancel an observation. */
export type ProviderConnectDialogKind =
  | "apiKey"
  | "copilot"
  | "localModel"
  | "login";

/** Why a dialog closed: the user finished it, or walked away from it. */
export type ProviderConnectDialogClose = "completed" | "dismissed";

/**
 * Dialogs that finish their part of the connect themselves, so a close they
 * cause is progress. The login dialog is absent deliberately: its device-code
 * / paste-back flow completes OUT OF BAND (the parent unmounts the dialog on
 * `ProviderLoginComplete`), so every close the user drives there is a real
 * abandon.
 */
const SELF_COMPLETING: readonly ProviderConnectDialogKind[] = [
  "apiKey",
  "copilot",
  "localModel",
];

/** Whether closing `kind` for `close` should cancel the connection observation. */
export function closeMeansCancel(
  kind: ProviderConnectDialogKind,
  close: ProviderConnectDialogClose,
): boolean {
  return !(close === "completed" && SELF_COMPLETING.includes(kind));
}
