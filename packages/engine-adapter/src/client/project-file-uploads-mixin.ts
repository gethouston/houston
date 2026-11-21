import * as controlPlane from "../control-plane";
import {
  type FileUploadOptions,
  frameBatch,
  planAttachmentBatches,
  sdkUploadOptions,
} from "./attachment-batches";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function ProjectFileUploadsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProjectFileUploads extends Base {
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
