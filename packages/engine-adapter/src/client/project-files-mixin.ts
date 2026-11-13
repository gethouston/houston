import {
  FilePreviewError,
  type FilePreviewOptions,
  type ProjectFile,
  parseFilePreviewRefusal,
} from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import {
  type FileUploadOptions,
  frameBatch,
  planAttachmentBatches,
  sdkUploadOptions,
} from "./attachment-batches";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Workspace file transport. JSON operations bind sdk.files; binary downloads
 * return Blobs here and use the SDK's preview retry policy.
 * Browser uploads preserve the batch plan and File identity for the SDK.
 */
export function ProjectFilesMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProjectFiles extends Base {
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

    private async cpFilesFetch(
      agentId: string,
      path: string,
      init?: RequestInit,
      preview?: FilePreviewOptions,
    ): Promise<Response> {
      if (!this.ctx.cp)
        throw new Error("cpFilesFetch called without a control-plane config");
      if (preview) path += `&as=pdf&lang=${encodeURIComponent(preview.lang)}`;
      return controlPlane.cpFetch(
        this.ctx.cp,
        `/agents/${encodeURIComponent(agentId)}/${path}`,
        init,
      );
    }
    async listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
      if (!this.ctx.cp) return [];
      return viaSdk(`${controlPlane.agentPath(agentPath)}/files`, () =>
        this.ctx.sdk.files.listProjectFiles(agentPath),
      );
    }
    async readProjectFile(agentPath: string, relPath: string): Promise<string> {
      if (!this.ctx.cp) return "";
      return viaSdk(`${controlPlane.agentPath(agentPath)}/files/read`, () =>
        this.ctx.sdk.files.readProjectFile(agentPath, relPath),
      );
    }
    /** Downloads a file from an agent's workspace.
     *
     * Raw bytes of a workspace file (binary-safe) plus its served MIME type.
     * @assistant group:files hidden: binary download; returns a Blob no chat turn can carry.
     * @assistant hands: request_hands_on(files) */
    async downloadProjectFile(
      agentPath: string,
      relPath: string,
      preview?: FilePreviewOptions,
    ): Promise<{ blob: Blob; contentType: string }> {
      if (!this.ctx.cp) throw new Error("downloads need a cloud workspace");
      const download = () =>
        this.cpFilesFetch(
          agentPath,
          `files/download?path=${encodeURIComponent(relPath)}`,
          undefined,
          preview,
        ).catch((error: unknown) => {
          const refusal =
            preview && error instanceof HoustonEngineError
              ? parseFilePreviewRefusal(error.body)
              : null;
          if (refusal && error instanceof HoustonEngineError)
            throw new FilePreviewError(
              refusal.code,
              refusal.error,
              error.status === 503 ? error.retryAfterMs : undefined,
            );
          throw error;
        });
      const res = await (preview
        ? this.ctx.sdk.files.loadPreview(download)
        : download());
      return {
        blob: await res.blob(),
        contentType:
          res.headers.get("content-type") ?? "application/octet-stream",
      };
    }
    async deleteFile(agentPath: string, relPath: string): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(`${controlPlane.agentPath(agentPath)}/files`, () =>
        this.ctx.sdk.files.deleteFile(agentPath, relPath),
      );
    }
    async renameFile(
      agentPath: string,
      relPath: string,
      newName: string,
    ): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(`${controlPlane.agentPath(agentPath)}/files/rename`, () =>
        this.ctx.sdk.files.renameFile(agentPath, relPath, newName),
      );
    }
    async createFolder(
      agentPath: string,
      folderName: string,
    ): Promise<{ created: string }> {
      if (!this.ctx.cp) return { created: folderName };
      return viaSdk(`${controlPlane.agentPath(agentPath)}/files/folder`, () =>
        this.ctx.sdk.files.createFolder(agentPath, folderName),
      );
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
    async moveProjectFile(
      agentPath: string,
      relPath: string,
      toDir: string | null,
    ): Promise<void> {
      if (!this.ctx.cp) throw new Error("Moving files needs a connected host.");
      await viaSdk(`${controlPlane.agentPath(agentPath)}/files/move`, () =>
        this.ctx.sdk.files.moveProjectFile(agentPath, relPath, toDir),
      );
    }
    /** Downloads everything in an agent's workspace as one archive.
     *
     * One zip of the workspace ("Download all") or, with `path`, of a single
     * folder's subtree — for deployments with no local file manager to reveal
     * in (cloud pods, web builds).
     * @assistant group:files hidden: binary download; returns a zip Blob no chat turn can carry.
     * @assistant hands: request_hands_on(files) */
    async downloadProjectArchive(
      agentPath: string,
      path?: string,
    ): Promise<{ blob: Blob; contentType: string }> {
      if (!this.ctx.cp) throw new Error("Downloads need a connected host.");
      const res = await this.cpFilesFetch(
        agentPath,
        `files/archive${path ? `?path=${encodeURIComponent(path)}` : ""}`,
      );
      return {
        blob: await res.blob(),
        contentType: res.headers.get("content-type") ?? "application/zip",
      };
    }
  }
  return ProjectFiles;
}
