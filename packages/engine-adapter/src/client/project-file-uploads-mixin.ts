import * as controlPlane from "../control-plane";
import {
  type FileUploadOptions,
  frameBatch,
  planAttachmentBatches,
  sdkUploadOptions,
} from "./attachment-batches";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** Browser upload batches preserve folder paths and File identity for sdk.files. */
export function ProjectFileUploadsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProjectFileUploads extends Base {
    // ---- composer attachments ----
    // Upload the dropped files into the target agent's workspace (its durable
    // `uploads/` folder) via the host's /agents/:id/attachments route; the
    // runtime's clamped file tools then Read them at the relative paths returned
    // here (the sender encodes those paths into the message), in this turn or any
    // later conversation. Standalone web has no workspace to write into — fail loud.
    async saveAttachments(
      agentPath: string,
      scopeId: string,
      files: File[],
      opts?: FileUploadOptions,
    ): Promise<string[]> {
      if (files.length === 0) return [];
      if (!this.ctx.cp) throw new Error("Attachments need a cloud workspace.");
      const route = `${controlPlane.agentPath(agentPath)}/attachments`;
      const paths: string[] = [];
      for (const batch of planAttachmentBatches(files)) {
        const frames = frameBatch(batch);
        paths.push(
          ...(await viaSdk(route, () =>
            this.ctx.sdk.files.saveAttachments(
              agentPath,
              scopeId,
              frames,
              sdkUploadOptions(opts),
            ),
          )),
        );
      }
      return paths;
    }

    // Upload browser Files into the workspace (Files section drag-drop /
    // Browse / folder pick). Batched here, one commit request per batch, so a
    // many-file folder doesn't turn into hundreds of round trips. Small files
    // batch below the host's upload cap; the SDK chooses base64 or resumable
    // transfer for each named Blob.
    async uploadProjectFiles(
      agentPath: string,
      files: File[],
      targetDir?: string | null,
      opts?: FileUploadOptions,
    ): Promise<void> {
      if (files.length === 0) return;
      if (!this.ctx.cp)
        throw new Error("Uploading files needs a connected host.");
      const path = `${controlPlane.agentPath(agentPath)}/files/import`;
      for (const batch of planAttachmentBatches(files)) {
        const frames = frameBatch(batch);
        await viaSdk(path, () =>
          this.ctx.sdk.files.uploadProjectFiles(
            agentPath,
            frames,
            targetDir,
            sdkUploadOptions(opts),
          ),
        );
      }
    }
  }
  return ProjectFileUploads;
}
