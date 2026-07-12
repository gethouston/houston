import type { ProjectFile } from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

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
      return controlPlane.saveAttachments(
        this.ctx.cp,
        this.ctx.requireAgentId(),
        scopeId,
        files,
      );
    }

    // ---- project files (the agent's REAL workspace) ----
    // In cloud mode the workspace is a GCS prefix served by the control plane at
    // /agents/:id/files*. agentPath IS the agentId here (folderPath = agent.id).
    // In synthetic/local web mode there is no real workspace, so these are inert.
    private async cpFilesFetch(
      agentId: string,
      path: string,
      init?: RequestInit,
    ): Promise<Response> {
      if (!this.ctx.cp)
        throw new Error("cpFilesFetch called without a control-plane config");
      const cp = this.ctx.cp;
      const res = await controlPlane.gatewayAuthFetch(
        cp.token,
        () => cp.activeOrgSlug,
      )(`${cp.baseUrl}/agents/${encodeURIComponent(agentId)}/${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
      if (!res.ok)
        throw new HoustonEngineError(
          res.status,
          await res.json().catch(() => ({})),
        );
      return res;
    }
    async listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
      if (!this.ctx.cp) return [];
      return (await (
        await this.cpFilesFetch(agentPath, "files")
      ).json()) as ProjectFile[];
    }
    async readProjectFile(agentPath: string, relPath: string): Promise<string> {
      if (!this.ctx.cp) return "";
      const res = await this.cpFilesFetch(
        agentPath,
        `files/read?path=${encodeURIComponent(relPath)}`,
      );
      const body = (await res.json()) as { content: string; base64: boolean };
      return body.base64 ? atob(body.content) : body.content;
    }
    /** Raw bytes of a workspace file (binary-safe) plus its served MIME type. */
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
      await this.cpFilesFetch(
        agentPath,
        `files?path=${encodeURIComponent(relPath)}`,
        { method: "DELETE" },
      );
    }
    async renameFile(
      agentPath: string,
      relPath: string,
      newName: string,
    ): Promise<void> {
      if (!this.ctx.cp) return;
      await this.cpFilesFetch(agentPath, "files/rename", {
        method: "POST",
        body: JSON.stringify({ path: relPath, newName }),
      });
    }
    async createFolder(
      agentPath: string,
      folderName: string,
    ): Promise<{ created: string }> {
      if (!this.ctx.cp) return { created: folderName };
      return (await (
        await this.cpFilesFetch(agentPath, "files/folder", {
          method: "POST",
          body: JSON.stringify({ path: folderName }),
        })
      ).json()) as { created: string };
    }
    /** Upload browser Files into the workspace (Files tab drag-drop / Browse),
     * optionally into a subfolder. One request per file, so each request stays
     * within the host's upload cap regardless of how many files were dropped. */
    async uploadProjectFiles(
      agentPath: string,
      files: File[],
      targetDir?: string | null,
    ): Promise<void> {
      if (files.length === 0) return;
      if (!this.ctx.cp)
        throw new Error("Uploading files needs a connected host.");
      for (const f of files) {
        const contentBase64 = controlPlane.bytesToBase64(
          new Uint8Array(await f.arrayBuffer()),
        );
        await this.cpFilesFetch(agentPath, "files/import", {
          method: "POST",
          body: JSON.stringify({
            dir: targetDir ?? null,
            files: [{ name: f.name, contentBase64 }],
          }),
        });
      }
    }
    /** Move a file/folder into another folder (null = workspace root). */
    async moveProjectFile(
      agentPath: string,
      relPath: string,
      toDir: string | null,
    ): Promise<void> {
      if (!this.ctx.cp) throw new Error("Moving files needs a connected host.");
      await this.cpFilesFetch(agentPath, "files/move", {
        method: "POST",
        body: JSON.stringify({ path: relPath, toDir }),
      });
    }
    /** One zip of the workspace ("Download all") or, with `path`, of a single
     * folder's subtree — for deployments with no local file manager to reveal
     * in (cloud pods, web builds). */
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
