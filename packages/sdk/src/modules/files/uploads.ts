/**
 * The two ways bytes get INTO an agent's workspace: files dropped on a chat
 * message, and files added from the Files section.
 *
 * These commit calls take mixed base64 and upload-ID entries. The SDK's
 * upload-batches module prepares device Blobs before reaching these literal
 * requests, so the catalog can still derive their route and body fields.
 */

import { isTransportFailure } from "../../transport-failure";
import { type HttpScope, httpRequest } from "../http";
import type { UploadBatchOptions, UploadEntry } from "./types";
import { uploadBytes } from "./upload-entries";
import { uploadRefusal } from "./upload-errors";
import { UploadInterruptedError, type UploadRoute } from "./upload-interrupted";

/** A clock reading to time an upload by: monotonic when the host has one. */
function uploadClock(scope: HttpScope): number {
  const clock = scope.ports.clock;
  return clock.monotonic?.() ?? clock.now();
}

/**
 * What a failed upload POST rethrows. A transport failure (`fetch` rejecting
 * with a browser's network `TypeError`: no answer at all) becomes an
 * {@link UploadInterruptedError} carrying the elapsed time and the batch's
 * size; an HTTP answer and an abort pass through untouched. Each call site
 * keeps its literal `httpRequest(…)`, which `check:sdk-parity` and the
 * assistant catalog read the route and body fields off.
 */
function uploadFailure(
  err: unknown,
  scope: HttpScope,
  route: UploadRoute,
  startedAt: number,
  files: UploadEntry[],
): unknown {
  // A coding-bug TypeError stays itself, so it still files as a bug.
  if (!isTransportFailure(err)) return err;
  // Decoded size: base64 carries 3 bytes per 4 characters.
  const bytes = files.reduce((sum, f) => sum + uploadBytes(f), 0);
  const elapsed = Math.max(0, uploadClock(scope) - startedAt);
  return new UploadInterruptedError(route, bytes, elapsed, err.message);
}

/**
 * Uploads files to attach to a message.
 *
 * Composer attachments. Upload the dropped files INTO the agent's workspace —
 * its durable, Files-section-visible `uploads/` folder — so the runtime's clamped
 * file tools can Read them during this turn and any later conversation
 * (HOU-706), and return the RELATIVE workspace paths the host stored them at —
 * which the sender encodes verbatim into the message ("Read these attached
 * files: …"). Base64 bytes or a completed upload ID reach the Vfs through
 * this commit route; the agent resolves each path against its workspace root.
 *
 * Folder uploads (HOU-808): a file picked or dropped as part of a folder
 * carries `webkitRelativePath`; we forward it as `relPath` and the host stores
 * the file nested (`uploads/<folder>/…`) so the folder's structure survives.
 * Pods predating folder support ignore the field and store the flat filename —
 * every returned path is still exact, the upload just loses its nesting.
 *
 * `scopeId` is legacy: current hosts ignore it, but engine pods that predate
 * the durable-uploads layout still 400 without it — keep sending it until no
 * pre-HOU-706 pod remains.
 * @assistant group:attachments hidden: the composer owns this; it frames the files a person dropped on a message, and writeAgentFile is how the assistant puts content into a workspace.
 */
export async function saveAttachments(
  scope: HttpScope,
  agentId: string,
  scopeId: string,
  files: UploadEntry[],
  opts?: UploadBatchOptions,
): Promise<string[]> {
  const startedAt = uploadClock(scope);
  let res: Response;
  try {
    res = await httpRequest(
      scope,
      `/agents/${encodeURIComponent(agentId)}/attachments`,
      {
        method: "POST",
        body: JSON.stringify({ scopeId, files }),
        signal: opts?.signal,
      },
    );
  } catch (err) {
    throw uploadRefusal(
      uploadFailure(err, scope, "attachments", startedAt, files),
    );
  }
  const paths = ((await res.json()) as { paths: string[] }).paths;
  return paths;
}

/**
 * Uploads files from the user's device into an agent's workspace.
 *
 * Upload browser Files into the workspace (Files section drag-drop /
 * Browse / folder pick), optionally into a subfolder. Folder-derived files
 * carry `webkitRelativePath`, forwarded as `relPath` so the host stores them
 * nested and the folder structure survives (HOU-889); hosts predating it
 * ignore the field and store the flat name. Small files batch together
 * (the same size-budgeted plan attachments use) so a many-file folder
 * doesn't turn into hundreds of round trips, while every request stays
 * within the host's upload cap.
 * @assistant group:files hidden: the Files section owns the picker that reads files off the person's device; readProjectFile and writeAgentFile are the assistant's way in and out of a workspace.
 * @assistant hands: request_hands_on(files)
 */
export async function uploadProjectFiles(
  scope: HttpScope,
  agentPath: string,
  files: UploadEntry[],
  targetDir?: string | null,
  opts?: UploadBatchOptions,
): Promise<void> {
  const startedAt = uploadClock(scope);
  try {
    await httpRequest(
      scope,
      `/agents/${encodeURIComponent(agentPath)}/files/import`,
      // The workspace root rides as an explicit `null` rather than an absent
      // key: the host reads both the same way, and this is the shape every
      // Files-section upload has sent.
      {
        method: "POST",
        body: JSON.stringify({ dir: targetDir ?? null, files }),
        signal: opts?.signal,
      },
    );
  } catch (err) {
    throw uploadRefusal(
      uploadFailure(err, scope, "files_import", startedAt, files),
    );
  }
}
