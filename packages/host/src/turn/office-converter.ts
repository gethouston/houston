import {
  FilePreviewError,
  type OfficeExtension,
  officeConverterHealthSchema,
  officePdfMetadataSchema,
  parseFilePreviewRefusal,
} from "@houston/wire-types";

export interface OfficePdf {
  pdf: Buffer;
  pageCount: number;
  version: string;
}
export interface OfficeConverter {
  version(): Promise<string>;
  convert(
    source: Buffer,
    ext: OfficeExtension,
    lang: string,
  ): Promise<OfficePdf>;
}

export function httpOfficeConverter(baseUrl: string): OfficeConverter {
  const base = baseUrl.replace(/\/$/, "");
  const request = async (path: string, init?: RequestInit) => {
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(35_000),
      });
    } catch (error) {
      throw new FilePreviewError(
        error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "conversion_unavailable",
        "Office converter could not be reached",
      );
    }
  };
  let revision: { version: string; expires: number } | undefined;
  return {
    async version() {
      if (revision && revision.expires > Date.now()) return revision.version;
      const res = await request("/health");
      if (!res.ok)
        throw new FilePreviewError(
          "conversion_unavailable",
          "Office converter is unavailable",
        );
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new FilePreviewError(
          "conversion_unavailable",
          "Office converter revision could not be read",
        );
      }
      const result = officeConverterHealthSchema.safeParse(body);
      if (!result.success)
        throw new FilePreviewError(
          "conversion_unavailable",
          "Office converter revision is unavailable",
        );
      revision = {
        version: result.data.version,
        expires: Date.now() + 5 * 60_000,
      };
      return result.data.version;
    },
    async convert(source, ext, lang) {
      const query = new URLSearchParams({ ext, lang });
      const res = await request(`/convert?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(source),
      });
      try {
        if (!res.ok) {
          const body: unknown = await res.json();
          // The service's refusal has no sentence; the host owns the client-facing message.
          const refusal = parseFilePreviewRefusal({
            ...(typeof body === "object" && body !== null ? body : {}),
            error: "Office preview conversion refused",
          });
          throw new FilePreviewError(
            refusal?.code ?? "conversion_failed",
            refusal?.error ?? "Office conversion failed",
          );
        }
        const metadata = officePdfMetadataSchema.safeParse({
          version: res.headers.get("x-converter-version"),
          pageCount: Number(res.headers.get("x-page-count")),
        });
        const pdf = Buffer.from(await res.arrayBuffer());
        if (
          !metadata.success ||
          !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))
        ) {
          throw new FilePreviewError(
            "conversion_failed",
            "Office converter returned an invalid PDF",
          );
        }
        return { pdf, ...metadata.data };
      } catch (error) {
        if (error instanceof FilePreviewError) throw error;
        throw new FilePreviewError(
          "conversion_failed",
          "Office converter response could not be read",
        );
      }
    },
  };
}
