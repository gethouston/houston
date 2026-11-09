import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import { ATOMIC_TMP_SUFFIX } from "@houston/protocol";
import {
  FILE_PREVIEW_STATUS,
  FilePreviewError,
  OFFICE_MAX_BYTES,
  officeExtensionSchema,
  officePdfMetadataSchema,
  officePreviewLanguage,
} from "@houston/wire-types";
import { json } from "./deps";
import { contentDisposition } from "./files-mime";
import { pruneOfficeCache } from "./office-cache";
import type { OfficeConverter, OfficePdf } from "./office-converter";

export interface OfficePreview {
  preview(source: Buffer, ext: string, lang: string): Promise<OfficePdf>;
}

export function createOfficePreview(
  cacheDir: string,
  converter: OfficeConverter,
): OfficePreview {
  const keyFor = (source: Buffer, version: string, lang: string) =>
    createHash("sha256")
      .update(source)
      .update(JSON.stringify([version, lang]))
      .digest("hex");
  return {
    async preview(source, ext, lang) {
      const extension = officeExtensionSchema.safeParse(ext);
      if (!extension.success)
        throw new FilePreviewError(
          "unsupported_type",
          "This file type has no Office preview",
        );
      if (source.length > OFFICE_MAX_BYTES)
        throw new FilePreviewError(
          "too_large",
          "Office preview input exceeds 30 MiB",
        );
      lang = officePreviewLanguage(lang);
      const version = await converter.version();
      const key = keyFor(source, version, lang);
      try {
        const pdf = await readFile(join(cacheDir, `${key}.pdf`));
        const metadata = officePdfMetadataSchema.parse(
          JSON.parse(await readFile(join(cacheDir, `${key}.json`), "utf8")),
        );
        return { pdf, ...metadata };
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
      const converted = await converter.convert(source, extension.data, lang);
      // A deployment may change revisions between the health probe and conversion.
      const actualKey = keyFor(source, converted.version, lang);
      await mkdir(cacheDir, { recursive: true });
      for (const [suffix, bytes] of [
        ["pdf", converted.pdf],
        [
          "json",
          JSON.stringify({
            pageCount: converted.pageCount,
            version: converted.version,
          }),
        ],
      ] as const) {
        const destination = join(cacheDir, `${actualKey}.${suffix}`);
        const temp = `${destination}.${randomUUID()}${ATOMIC_TMP_SUFFIX}`;
        await writeFile(temp, bytes);
        await rename(temp, destination);
      }
      await pruneOfficeCache(cacheDir);
      return converted;
    },
  };
}

export async function serveOfficePreview(
  preview: OfficePreview | undefined,
  source: Buffer,
  name: string,
  lang: string,
  res: ServerResponse,
): Promise<void> {
  try {
    if (!preview)
      throw new FilePreviewError(
        "conversion_unavailable",
        "Office preview conversion is not configured",
      );
    const { pdf, pageCount } = await preview.preview(
      source,
      name.split(".").pop()?.toLowerCase() ?? "",
      lang,
    );
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Content-Disposition": contentDisposition("inline", `${name}.pdf`),
      "X-Houston-Page-Count": pageCount,
      "Cache-Control": "no-store",
    });
    res.end(pdf);
  } catch (error) {
    if (!(error instanceof FilePreviewError)) throw error;
    json(res, FILE_PREVIEW_STATUS[error.code], {
      error: error.message,
      code: error.code,
    });
  }
}
