import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommentKind, Lang } from "./model.ts";

export const WHY_MAX_LINES = 3;

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

const EXTERNAL_URL =
  /\bhttps?:\/\/(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b)[\w-]+(?:\.[\w-]+)+/;

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

function contentLines(lang: Lang, text: string, kind: CommentKind): string[] {
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

export function isWhy(lang: Lang, text: string, kind: CommentKind): boolean {
  const lines = contentLines(lang, text, kind);
  if (!lines[0]?.startsWith("WHY:") || lines.length > WHY_MAX_LINES)
    return false;
  const body = lines.join(" ");
  const adrs = [...body.matchAll(/\bADR-(\d{4})\b/g)].map((m) => m[1]);
  if (adrs.some((number) => !existingAdrs().has(number))) return false;
  return adrs.length > 0 || EXTERNAL_URL.test(body);
}
