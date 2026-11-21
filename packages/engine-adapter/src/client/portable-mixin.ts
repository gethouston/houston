import type { MigrationImportOptions } from "@houston/sdk";
import type {
  MigrationCounts,
  MigrationImportResult,
  MigrationMarker,
  MigrationSource,
  PortableExportRequest,
  PortableInstalledAgent,
  PortableInstallRequest,
  PortableInventoryPreview,
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import * as portable from "../portable";
import { install } from "../portable-install";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function PortableMixin<TBase extends BaseCtor>(Base: TBase) {
  class Portable extends Base {
    async portablePreview(
      agentPath: string,
    ): Promise<PortableInventoryPreview> {
      if (!this.ctx.cp)
        throw new Error("Sharing an agent needs a connected host.");
      return portable.exportPreview(this.ctx.cp, agentPath);
    }
    async portablePackage(
      agentPath: string,
      req: PortableExportRequest,
    ): Promise<ArrayBuffer> {
      if (!this.ctx.cp)
        throw new Error("Sharing an agent needs a connected host.");
      return portable.exportPackage(this.ctx.cp, agentPath, req);
    }
    async importPreview(
      bytes: ArrayBuffer | Uint8Array,
    ): Promise<PortableUploadPreviewResponse> {
      return portable.previewUpload(bytes);
    }
    async importScan(packageId: string): Promise<PortableScanResponse> {
      return portable.scanUpload(packageId);
    }
    async importInstall(
      req: PortableInstallRequest,
    ): Promise<PortableInstalledAgent> {
      if (!this.ctx.cp)
        throw new Error("Importing an agent needs a connected host.");
      return install(req, async (name, color, seed) => {
        const wire = await viaSdk("/agents", () =>
          this.ctx.sdk.agents.writes.create({ name, color, ...seed }),
        );
        return controlPlane.createdAgentToUi(wire, color);
      });
    }
    async migrationExport(
      agentPath: string,
      paths: string[],
    ): Promise<ArrayBuffer> {
      if (!this.ctx.cp)
        throw new Error("Copying agent data needs a connected host.");
      return viaSdk(
        `/agents/${encodeURIComponent(agentPath)}/migration/export`,
        () => this.ctx.sdk.migration.migrationExport(agentPath, paths),
      );
    }
    async migrationImport(
      agentPath: string,
      bytes: ArrayBuffer,
      opts?: MigrationImportOptions,
    ): Promise<MigrationImportResult> {
      if (!this.ctx.cp)
        throw new Error("Copying agent data needs a connected host.");
      return viaSdk(
        `/agents/${encodeURIComponent(agentPath)}/migration/import`,
        () => this.ctx.sdk.migration.importArchive(agentPath, bytes, opts),
      );
    }
    async migrationComplete(
      agentPath: string,
      source: MigrationSource,
      counts: MigrationCounts,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Copying agent data needs a connected host.");
      return viaSdk(
        `/agents/${encodeURIComponent(agentPath)}/migration/complete`,
        () =>
          this.ctx.sdk.migration.migrationComplete(agentPath, source, counts),
      );
    }
    async migrationStatus(agentPath: string): Promise<MigrationMarker | null> {
      if (!this.ctx.cp)
        throw new Error("Copying agent data needs a connected host.");
      return viaSdk(
        `/agents/${encodeURIComponent(agentPath)}/migration/status`,
        () => this.ctx.sdk.migration.migrationStatus(agentPath),
      );
    }
  }
  return Portable;
}
