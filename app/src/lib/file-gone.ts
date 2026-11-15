// Dependency-free subpath: the app's node:test entry points cannot load the
// SDK root (it pulls @houston/domain, whose extensionless imports node rejects).
import { isOutsideWorkspaceRefusal } from "@houston/sdk/files/outside-workspace";
import { useUIStore } from "../stores/ui";
import i18n from "./i18n";

/**
 * Why a workspace-file read (`files/download`, `files/read`) refused in a way
 * the person can understand, or null for a fault that keeps the loud path.
 *
 * - `file_gone`: the host's `404 file not found` (HOUSTON-APP-53E /
 *   PRODUCT-1780), answered when the path resolves inside the agent's
 *   workspace but no object is there: the agent linked a file it never wrote
 *   (or wrote under another name), or it was renamed or deleted after the
 *   link was rendered. Keyed on the structural `.status`, since the host
 *   answers no typed code; an agent-gone 404 on the same route (stale roster)
 *   is equally the user's state and shares the copy. The host logs WHY.
 * - `outside_workspace`: the host's typed `400 outside_workspace`, or the
 *   uncoded `400 invalid workspace path: <path>` an older cloud gateway
 *   answers for a sleeping agent (the SDK's `isOutsideWorkspaceRefusal`):
 *   the agent linked a path outside its files, such as the turn sandbox's
 *   `/work/houston-turn-<id>/...` (HOUSTON-APP-5HK), an internal `.houston/`
 *   document or a `..` path.
 *
 * Applied ONLY to the two reads; writes keep the default loud surfacing.
 */
export type FileReadRefusal = "file_gone" | "outside_workspace";

export function fileReadRefusal(err: unknown): FileReadRefusal | null {
  if (isOutsideWorkspaceRefusal(err)) return "outside_workspace";
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return status === 404 ? "file_gone" : null;
}

/** The authored copy (namespace `agents`) for each refusal. */
export const FILE_READ_REFUSAL_COPY = {
  file_gone: {
    title: "files.gone.title",
    description: "files.gone.description",
  },
  outside_workspace: {
    title: "files.outsideWorkspace.title",
    description: "files.outsideWorkspace.description",
  },
} as const;

/** `reportQuietError`, injected: its module pulls the analytics graph. */
export type OutsideWorkspaceReport = (
  kind: "outside_workspace",
  command: string,
  message: string,
  err: unknown,
  context?: Record<string, unknown>,
) => void;

/**
 * Surface a refused read: the authored info toast when `toast` (an inline
 * caller renders the same copy itself), and for `outside_workspace` ONE
 * fingerprinted quiet warning whether or not it toasts, since a burst of
 * them means agents keep linking such paths. A gone file reports nothing.
 * Returns the refusal, or null for a fault the caller reports as usual.
 */
export function surfaceFileReadRefusal(
  err: unknown,
  command: string,
  context: Record<string, unknown>,
  toast: boolean,
  report: OutsideWorkspaceReport,
): FileReadRefusal | null {
  const refusal = fileReadRefusal(err);
  if (refusal === "outside_workspace") {
    const message = err instanceof Error ? err.message : String(err);
    report("outside_workspace", command, message, err, context);
  }
  if (refusal && toast) {
    const copy = FILE_READ_REFUSAL_COPY[refusal];
    useUIStore.getState().addToast({
      title: i18n.t(`agents:${copy.title}`),
      description: i18n.t(`agents:${copy.description}`),
      variant: "info",
    });
  }
  return refusal;
}
