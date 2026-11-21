import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openingTags } from "./jsx-tags.ts";

export const REPO = join(import.meta.dirname, "..", "..");

const ROOTS = [
  "app/src",
  "packages/web/src",
  "packages/engine-adapter/src",
  "agentstore/src",
  "ui/showcase/specimens",
];

export const SANCTIONED = [
  "app/src/components/shell/provider-brand-colors.ts",
  "app/src/components/provider-browser/brand-mark.tsx",
  "app/src/components/auth/provider-brand-icons.tsx",
  "ui/chat/src/channel-brand-colors.ts",
  "app/src/main.tsx",
  "packages/web/src/new-engine/styles.ts",
  "ui/core/src/canvas.css",
  "app/src/styles/futuristic.css",
  "ui/showcase/specimens/foundations/effects-parts.ts",
  "ui/core/src/color-contrast.ts",
  "agentstore/src/lib/og-card.tsx",
  "app/src/components/organization/org-chart-share-card-art.ts",
];

export interface Rule {
  name: string;
  pattern: RegExp;
  remedy: string;
  scope?: "line" | "dialog";
}

const VARIANT = String.raw`(?:\[[^\]]*\]|[a-z0-9@_-]+(?:\[[^\]]*\])?):`;

export const RULES: Rule[] = [
  {
    name: "raw colour literal",
    pattern:
      /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{5}|[0-9a-fA-F]{3}|[0-9a-fA-F])?\b|(?<![a-zA-Z])rgba?\(/,
    remedy:
      "a visual change is a token edit (packages/design-tokens/tokens/*.json), never a literal — DESIGN.md §3.1",
  },
  {
    name: "raw Tailwind palette colour",
    pattern:
      /\b(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|inset-ring|inset-shadow|outline|divide(?:-[xy])?|fill|stroke|from|via|to|placeholder|caret|decoration|shadow|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    remedy:
      "status wears the semantic pair (danger/success/warning plus their -text and -ink), neutrals wear ink, ink-muted, chip and line — DESIGN.md §4",
  },
  {
    name: "undefined CSS variable",
    pattern: /hsl\(\s*var\(--[a-z0-9-]+\)\s*\)/,
    remedy:
      "use the Houston utility (bg-*/text-*/border-* on a --ht-* token) — DESIGN.md §4",
  },
  {
    name: "viewport height",
    pattern: /\b(?:min-|max-)?h-screen\b|(?<![a-z])\d+(?:\.\d+)?s?vh\b/,
    remedy: "full-height is dvh — never vh, svh or h-screen (DESIGN.md §3.8)",
  },
  {
    name: "desktop-first breakpoint",
    pattern: /\bmax-md:/,
    remedy:
      "unprefixed is the phone layer and md: is desktop — never max-md: (DESIGN.md §3.8)",
  },
  {
    name: "dialog width without sm:",
    scope: "dialog",
    pattern: new RegExp(
      String.raw`(?<=^|[\s"'\`{(,])(?!(?:${VARIANT})*sm:)(?:${VARIANT})*max-w-`,
    ),
    remedy:
      "the frame's unprefixed max-w-[calc(100%-2rem)] IS the phone gutter and tailwind-merge drops it for any unprefixed max-w-* at the call site — size a dialog with sm:max-w-* only (DESIGN.md §3.8)",
  },
];

export interface Offence {
  file: string;
  line: number;
  rule: string;
  text: string;
}

export function sourceRoots(): string[] {
  const ui = join(REPO, "ui");
  const roots = ROOTS.map((root) => join(REPO, root));
  for (const pkg of readdirSync(ui)) {
    const src = join(ui, pkg, "src");
    if (existsSync(src) && statSync(src).isDirectory()) roots.push(src);
  }
  return roots.filter((root) => existsSync(root));
}

export function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "__fixtures__") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(full)) out.push(full);
  }
  return out;
}

function blankComments(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, lead: string) =>
      lead === "" ? blank(match) : lead + blank(match.slice(lead.length)),
    );
}

export function guardedFiles(): string[] {
  const sanctioned = new Set(SANCTIONED);
  return sourceRoots()
    .flatMap((root) => walk(root))
    .map((file) => relative(REPO, file))
    .filter((file) => !sanctioned.has(file))
    .sort();
}

export const DIALOG_TAG = /<(?:Alert)?DialogContent\b/;

export function scan(file: string): Offence[] {
  const offences: Offence[] = [];
  const source = blankComments(readFileSync(join(REPO, file), "utf8"));
  source.split("\n").forEach((text, index) => {
    for (const rule of RULES) {
      if (rule.scope !== "dialog" && rule.pattern.test(text)) {
        offences.push({
          file,
          line: index + 1,
          rule: rule.name,
          text: text.trim(),
        });
      }
    }
  });
  for (const tag of openingTags(source, DIALOG_TAG)) {
    for (const rule of RULES) {
      if (rule.scope === "dialog" && rule.pattern.test(tag.text)) {
        offences.push({
          file,
          line: tag.line,
          rule: rule.name,
          text: tag.text.replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return offences.sort((a, b) => a.line - b.line);
}
