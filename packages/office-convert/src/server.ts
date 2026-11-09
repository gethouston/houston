import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  FILE_PREVIEW_STATUS,
  FilePreviewError,
  OFFICE_MAX_BYTES,
  officeExtensionSchema,
} from "@houston/wire-types/file-preview";
import { convert } from "./convert";

export const CONVERTER_VERSION = process.env.CONVERTER_VERSION || "development";

async function readSource(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer | null> {
  if (Number(req.headers["content-length"]) > maxBytes) {
    req.resume();
    return null;
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      req.resume();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createConverterServer(
  options: {
    convert?: typeof convert;
    version?: string;
    maxBytes?: number;
    report?: (error: unknown) => void;
  } = {},
) {
  const version = options.version ?? CONVERTER_VERSION;
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "X-Converter-Version": version,
    });
    res.end(JSON.stringify(body));
  };
  return createServer((req, res) => {
    const handle = async () => {
      const url = new URL(req.url || "/", "http://office-convert");
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { status: "ok", version });
        return;
      }
      if (req.method !== "POST" || url.pathname !== "/convert") {
        json(res, 404, { error: "not found" });
        return;
      }
      const ext = officeExtensionSchema.safeParse(url.searchParams.get("ext"));
      if (!ext.success) {
        json(res, 415, { code: "unsupported_type" });
        return;
      }
      const source = await readSource(
        req,
        options.maxBytes ?? OFFICE_MAX_BYTES,
      );
      if (source === null) {
        json(res, 413, { code: "too_large" });
        return;
      }
      const { pdf, pageCount } = await (options.convert ?? convert)(
        source,
        ext.data,
        url.searchParams.get("lang") || "en",
      );
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "X-Page-Count": pageCount,
        "X-Converter-Version": version,
      });
      res.end(pdf);
    };
    handle().catch((error: unknown) => {
      options.report?.(error);
      const code =
        error instanceof FilePreviewError ? error.code : "conversion_failed";
      json(res, FILE_PREVIEW_STATUS[code], { code });
    });
  });
}
