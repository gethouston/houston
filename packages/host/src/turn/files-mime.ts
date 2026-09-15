import { extOf } from "./files-path";

/**
 * How a workspace file is HANDED to the browser: its media type, and the
 * header that decides whether the browser shows it or saves it. Split out of
 * `files.ts` (the HTTP handler) so that module stays the route surface alone.
 */

/** Extension → MIME for the deliverables agents actually produce. */
const MIME: Record<string, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  zip: "application/zip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
};

export const mimeFor = (name: string): string =>
  MIME[extOf(name).toLowerCase()] ?? "application/octet-stream";

/** RFC 6266 Content-Disposition with a safe ASCII fallback + UTF-8 filename*. */
export const contentDisposition = (
  kind: "attachment" | "inline",
  name: string,
): string => {
  const ascii = Array.from(name, (c) =>
    c.charCodeAt(0) < 0x7f && c !== '"' && c !== "\\" ? c : "_",
  ).join("");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};
