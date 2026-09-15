/**
 * The two ways bytes get INTO an agent's workspace: files dropped on a chat
 * message, and files added from the Files section.
 *
 * Both take one already-framed batch — `{ name, contentBase64, relPath }`, the
 * shape the host reads — and post it. The batching that produces those batches
 * belongs to the surface, not here: it reads a browser `File`'s size and bytes
 * to keep each request inside the host's cap and to hold only one batch in
 * memory at a time, and a `File` is a DOM object this module must not know.
 *
 * Kept out of `index.ts` so the module factory there stays within the
 * file-size budget, and out of `http.ts` because these two are the family's
 * binary half — hidden from the assistant, framed by their caller.
 */

import { type HttpScope, httpRequest } from "../http";
import type { FileUpload } from "./types";

/**
 * Uploads files to attach to a message.
 *
 * Composer attachments. Upload the dropped files INTO the agent's workspace —
 * its durable, Files-section-visible `uploads/` folder — so the runtime's clamped
 * file tools can Read them during this turn and any later conversation
 * (HOU-706), and return the RELATIVE workspace paths the host stored them at —
 * which the sender encodes verbatim into the message ("Read these attached
 * files: …"). Binary rides as base64 JSON (the host writes the bytes through
 * its Vfs); the agent resolves each path against its workspace root.
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
  files: FileUpload[],
): Promise<string[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/attachments`,
    { method: "POST", body: JSON.stringify({ scopeId, files }) },
  );
  return ((await res.json()) as { paths: string[] }).paths;
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
 */
export async function uploadProjectFiles(
  scope: HttpScope,
  agentPath: string,
  files: FileUpload[],
  targetDir?: string | null,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files/import`,
    // The workspace root rides as an explicit `null` rather than an absent
    // key: the host reads both the same way, and this is the shape every
    // Files-section upload has sent.
    { method: "POST", body: JSON.stringify({ dir: targetDir ?? null, files }) },
  );
}
