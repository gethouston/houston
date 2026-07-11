import type {
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
  PortableExportRequest,
  PortableInstalledAgent,
  PortableInstallRequest,
  PortableInventoryPreview,
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "../../../../../ui/engine-client/src/types";
import * as portable from "../portable";
import type { BaseCtor } from "./mixin";

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
    async importInstall(
      req: PortableInstallRequest,
    ): Promise<PortableInstalledAgent> {
      if (!this.ctx.cp)
        throw new Error("Importing an agent needs a connected host.");
      return portable.install(this.ctx.cp, req);
    }
  }
  return Portable;
}
