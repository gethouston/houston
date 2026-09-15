import type { ProjectFile } from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import { frameBatch, planAttachmentBatches } from "./attachment-batches";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * The agent's REAL workspace, and the two ways bytes get into it.
 *
 * In cloud the workspace is a GCS prefix the control plane serves at
 * `/agents/:id/files*`; `agentPath` IS the agent id here (folderPath = agent.id).
 * In synthetic/local web mode there is no real workspace, so these are inert —
 * every method keeps that guard, because `sdk.files` throws on every non-2xx
 * and would turn "there is nothing to list" into an error.
 *
 * Uploads are split at the DOM line: the batching and base64 framing of browser
 * `File`s stay here (`./attachment-batches`), while the requests they produce
 * ride `sdk.files`. The two BINARY reads keep their own transport — they answer
 * a `Blob`, which no JSON bridge can carry, so there is no SDK twin to call.
 */
export function ProjectFilesMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProjectFiles extends Base {
    // ---- composer attachments ----
    // Upload the dropped files into the selected agent's workspace (its durable
    // `uploads/` folder) via the host's /agents/:id/attachments route; the
    // runtime's clamped file tools then Read them at the relative paths returned
    // here (the sender encodes those paths into the message), in this turn or any
    // later conversation. Standalone web has no workspace to write into — fail loud.
    async saveAttachments(scopeId: string, files: File[]): Promise<string[]> {
      if (files.length === 0) return [];
      if (!this.ctx.cp) throw new Error("Attachments need a cloud workspace.");
      const agentId = this.ctx.requireAgentId();
      const path = `${controlPlane.agentPath(agentId)}/attachments`;
      const paths: string[] = [];
      for (const batch of planAttachmentBatches(files)) {
        const frames = await frameBatch(batch);
        paths.push(
          ...(await viaSdk(path, () =>
            this.ctx.sdk.files.saveAttachments(agentId, scopeId, frames),
          )),
        );
      }
      return paths;
    }

    // ---- project files (the agent's REAL workspace) ----
    // The transport the two binary reads still own. Routed through cpFetch so
    // they ride the same transient-retry path as every other control-plane call
    // (HOU-1085: a bare gatewayAuthFetch here gave files listings zero retries
    // through a brief network blip).
    private async cpFilesFetch(
      agentId: string,
      path: string,
      init?: RequestInit,
    ): Promise<Response> {
      if (!this.ctx.cp)
        throw new Error("cpFilesFetch called without a control-plane config");
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
    ): Promise<{ blob: Blob; contentType: string }> {
      if (!this.ctx.cp) throw new Error("downloads need a cloud workspace");
      const res = await this.cpFilesFetch(
        agentPath,
        `files/download?path=${encodeURIComponent(relPath)}`,
      );
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
    // Upload browser Files into the workspace (Files section drag-drop /
    // Browse / folder pick). Batched here, one request per batch, so a
    // many-file folder doesn't turn into hundreds of round trips and no batch
    // exceeds the host's upload cap.
    async uploadProjectFiles(
      agentPath: string,
      files: File[],
      targetDir?: string | null,
    ): Promise<void> {
      if (files.length === 0) return;
      if (!this.ctx.cp)
        throw new Error("Uploading files needs a connected host.");
      const path = `${controlPlane.agentPath(agentPath)}/files/import`;
      for (const batch of planAttachmentBatches(files)) {
        const frames = await frameBatch(batch);
        await viaSdk(path, () =>
          this.ctx.sdk.files.uploadProjectFiles(agentPath, frames, targetDir),
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
