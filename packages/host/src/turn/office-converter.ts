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
  return {
    async version() {
      const res = await request("/health");
      if (!res.ok)
        throw new FilePreviewError(
          "conversion_unavailable",
          "Office converter is unavailable",
        );
      const result = officeConverterHealthSchema.safeParse(await res.json());
      if (!result.success)
        throw new FilePreviewError(
          "conversion_unavailable",
          "Office converter revision is unavailable",
        );
      return result.data.version;
    },
    async convert(source, ext, lang) {
      const query = new URLSearchParams({ ext, lang });
      const res = await request(`/convert?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(source),
      });
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
    },
  };
}
