import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommentKind, Lang } from "./model.ts";

export const WHY_MAX_LINES = 3;
export const WHY_MAX_WIDTH = 140;

const adrDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/adr",
);

let adrNumbers: ReadonlySet<string> | null = null;

export function existingAdrs(): ReadonlySet<string> {
  adrNumbers ??= new Set(
    readdirSync(adrDir).flatMap(
      (name) => /^(\d{4})-.+\.md$/.exec(name)?.[1] ?? [],
    ),
  );
  return adrNumbers;
}

const ISSUE_ID = /\b(?:HOU|PRODUCT|H)-\d+\b/;
const URL_TEXT = /\b[a-z][\w+.-]*:\/\/[^\s<>"'`)\]]+/gi;
const TRACKER =
  /\b(?:tasks\.gethouston\.ai|linear\.app)\b|\bgithub\.com\/gethouston\/[\w.-]+\/(?:issues|pull)\b/i;
const PRIVATE_HOST =
  /^(?:localhost|[\d.]+|\[[\da-f:.]+\])$|\.(?:localhost|local|internal|lan|home\.arpa|test|invalid|example)$/i;

function bodyLines(lang: Lang, text: string, kind: CommentKind): string[] {
  if (lang === "shell")
    return text.split(/\r?\n/).map((line) => line.trim().replace(/^#+/, ""));
  const block =
    kind === "jsx" ? text.replace(/^\{\s*/, "").replace(/\s*\}$/, "") : text;
  if (kind === "line")
    return block.split(/\r?\n/).map((line) => line.trim().replace(/^\/\//, ""));
  return block
    .replace(/^\/\*+/, "")
    .replace(/\*\/$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?/, ""));
}

export function contentLines(
  lang: Lang,
  text: string,
  kind: CommentKind,
): string[] {
  return bodyLines(lang, text, kind)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function startsWhy(
  lang: Lang,
  text: string,
  kind: CommentKind,
): boolean {
  return contentLines(lang, text, kind)[0]?.startsWith("WHY:") ?? false;
}

function publicReference(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.replace(/[.,;:!?]+$/, ""));
  } catch {
    return false;
  }
  const host = url.hostname;
  if (url.protocol !== "https:" || !host.includes(".")) return false;
  return !PRIVATE_HOST.test(host);
}

export function isWhy(
  lang: Lang,
  text: string,
  kind: CommentKind,
  adrs: ReadonlySet<string> = existingAdrs(),
): boolean {
  const lines = contentLines(lang, text, kind);
  if (!lines[0]?.startsWith("WHY:") || lines.length > WHY_MAX_LINES)
    return false;
  if (text.split(/\r?\n/).some((line) => line.trim().length > WHY_MAX_WIDTH))
    return false;
  const body = lines.join(" ");
  if (ISSUE_ID.test(body) || TRACKER.test(body)) return false;
  const urls = body.match(URL_TEXT) ?? [];
  if (!urls.every(publicReference)) return false;
  const cited = [...body.matchAll(/\bADR-(\d{4})\b/g)].map((m) => m[1]);
  if (cited.some((number) => !adrs.has(number))) return false;
  return cited.length > 0 || urls.length > 0;
}
