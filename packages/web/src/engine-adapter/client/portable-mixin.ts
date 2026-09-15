import type {
  MigrationImportOptions,
  MigrationImportResult,
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
  PortableExportRequest,
  PortableInstalledAgent,
  PortableInstallRequest,
  PortableInventoryPreview,
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import * as portable from "../portable";
import { importFromStoreLink } from "../portable-from-store";
import { install } from "../portable-install";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function PortableMixin<TBase extends BaseCtor>(Base: TBase) {
  class Portable extends Base {
    // ---- portable agents (share with / from a friend) — host only ----
    // The wizards' backend. Preview/export/anonymize/install talk to the
    // host's v3 portable routes; the uploaded archive is unpacked in the
    // browser, parked in memory until install, and the threat scan runs on it
    // right there — the scan is the same pure `@houston/domain` heuristic the
    // host uses (see ./portable.ts).
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
    async portableAnonymize(
      agentPath: string,
      req: PortableAnonymizeRequest,
    ): Promise<PortableAnonymizeResponse> {
      if (!this.ctx.cp)
        throw new Error("Sharing an agent needs a connected host.");
      return portable.anonymize(this.ctx.cp, agentPath, req);
    }
    async importPreview(
      bytes: ArrayBuffer | Uint8Array,
    ): Promise<PortableUploadPreviewResponse> {
      return portable.previewUpload(bytes);
    }
    async importScan(packageId: string): Promise<PortableScanResponse> {
      return portable.scanUpload(packageId);
    }
    async importFromStoreLink(
      url: string,
    ): Promise<PortableUploadPreviewResponse> {
      if (!this.ctx.cp)
        throw new Error("Installing from a link needs a connected host.");
      return importFromStoreLink(this.ctx.cp, url);
    }
    async importInstall(
      req: PortableInstallRequest,
    ): Promise<PortableInstalledAgent> {
      if (!this.ctx.cp)
        throw new Error("Importing an agent needs a connected host.");
      // The create is the adapter's own SDK-delegated one (byte-identical
      // POST /agents with the seed body, no refetch); `portable.ts` holds no
      // SDK handle, so it takes it as a parameter. The install carries the
      // source agent's colour on the wire — there is no picker here to seed a
      // client overlay from.
      return install(req, async (name, color, seed) => {
        const wire = await viaSdk("/agents", () =>
          this.ctx.sdk.agents.writes.create({ name, color, ...seed }),
        );
        return controlPlane.createdAgentToUi(wire, color);
      });
    }
    // ---- agent data migration (agent-scoped export/import) — host only ----
    // Delegated to `sdk.migration` (`packages/sdk/src/modules/migration`).
    // "Copy an agent" runs both halves against this engine; the desktop→cloud
    // wizard drives the same routes over its own two peers (`app/src/lib/
    // cloud-migration-transport.ts`), which is why neither half degrades here.
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
        () => this.ctx.sdk.migration.migrationImport(agentPath, bytes, opts),
      );
    }
  }
  return Portable;
}
