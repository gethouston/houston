import type { CommentKind, CommentRole, Lang, Pinned } from "./model.ts";
import { isWhy } from "./why.ts";

const TS_DIRECTIVE =
  /^(?:biome-ignore|@ts-(?:expect-error|ignore|nocheck|check)\b|eslint[-\s]|prettier-ignore|(?:c8|v8|istanbul) ignore|@vitest-environment|[#@]\s*source(?:Mapping)?URL=|[#@]__(?:PURE|NO_SIDE_EFFECTS)__|@vite-ignore|webpack[A-Z]|@jsx|@refresh\b|@license|@preserve|SPDX-License-Identifier)/;

const CSS_DIRECTIVE =
  /^(?:biome-ignore|stylelint-|[#@]\s*source(?:Mapping)?URL=|@license|@preserve|SPDX-License-Identifier)/;

const JS_TYPE_TAG =
  /(?:^|\s)@(?:type|typedef|template|satisfies|import|callback|this|enum|overload|extends|augments|implements)\b|@(?:param|returns?|property|prop)\s*\{/;

function blockLines(text: string): string[] {
  return text
    .replace(/^\/\*+!?/, "")
    .replace(/\*\/$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s*/, ""));
}

function lineBodies(text: string, marker: RegExp): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(marker, "").trim());
}

function tsTooling(file: string, text: string, kind: CommentKind): boolean {
  if (kind === "line") {
    if (/^\/\/\/\s*<(?:reference|amd-)/.test(text)) return true;
    return lineBodies(text, /^\/\/\/?/).some((body) => TS_DIRECTIVE.test(body));
  }
  const block =
    kind === "jsx" ? text.replace(/^\{\s*/, "").replace(/\s*\}$/, "") : text;
  if (block.startsWith("/*!")) return true;
  const lines = blockLines(block);
  if (lines.some((line) => TS_DIRECTIVE.test(line))) return true;
  if (!block.startsWith("/**")) return false;
  if (lines.some((line) => /^@(?:assistant|deprecated)\b/.test(line)))
    return true;
  return /\.(?:js|jsx|mjs|cjs)$/.test(file) && JS_TYPE_TAG.test(block);
}

export const RUST_SAFETY = /^\/(?:\/|\*)\s*SAFETY:/;

function rustTooling(text: string): boolean {
  if (/^\/\/(?:\/(?!\/)|!)/.test(text)) return true;
  if (RUST_SAFETY.test(text)) return true;
  return /^\/\*(?:\*(?![*/])|!)/.test(text);
}

function cssTooling(text: string): boolean {
  if (text.startsWith("/*!")) return true;
  return blockLines(text).some((line) => CSS_DIRECTIVE.test(line));
}

function shellTooling(text: string): boolean {
  return lineBodies(text, /^#+/).some((body) => /^shellcheck\s/.test(body));
}

const DOC_SCOPE = /^(?:ui\/|packages\/sdk\/src\/)/;
const TEST_FILE =
  /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

function isPublicDoc(file: string, text: string, attached: boolean): boolean {
  return (
    attached &&
    text.startsWith("/**") &&
    DOC_SCOPE.test(file) &&
    !TEST_FILE.test(file)
  );
}

function isTooling(
  lang: Lang,
  file: string,
  text: string,
  kind: CommentKind,
): boolean {
  if (lang === "ts") return tsTooling(file, text, kind);
  if (lang === "rust") return rustTooling(text);
  if (lang === "css") return cssTooling(text);
  return shellTooling(text);
}

export function roleOf(
  lang: Lang,
  file: string,
  text: string,
  kind: CommentKind,
  attached: boolean,
  pinned: readonly Pinned[],
): CommentRole {
  if (
    pinned.some((pin) => pin.path === file && text.startsWith(pin.startsWith))
  )
    return "tooling";
  if (isTooling(lang, file, text, kind)) return "tooling";
  if (isWhy(lang, text, kind)) return "why";
  if (lang === "ts" && isPublicDoc(file, text, attached)) return "doc";
  return "prose";
}
