import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openingTags } from "./jsx-tags.ts";

/**
 * The scanner behind `token-discipline.test.ts`, split out so the test reads
 * as the rules and their outstanding inventory rather than as directory
 * plumbing.
 */

export const REPO = join(import.meta.dirname, "..", "..");

/** Every surface that renders Houston's UI. */
const ROOTS = [
  "app/src",
  "packages/web/src",
  "packages/engine-adapter/src",
  "agentstore/src",
  "ui/showcase/specimens",
];

/**
 * DESIGN.md §3.1, verbatim: the ONLY files allowed a raw colour.
 *
 * Brand marks (a logo's colour is the logo), the pre-boot frame that paints
 * before any token CSS exists, the effects layer and the specimen that
 * documents it (aurora and glass sheen are authored values, not semantic
 * roles), the colour maths that parses and formats every colour form, and the
 * social share image that next/og renders to a PNG with no CSS variables to
 * read. Anything else wanting one is a missing token.
 */
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
];

export interface Rule {
  /** What the offence is, in the failure message. */
  name: string;
  pattern: RegExp;
  /** Why it is one, and what to reach for instead. */
  remedy: string;
  /**
   * What the pattern is tested against. `line` (the default) reads one line at
   * a time; `dialog` reads a whole `<DialogContent …>` opening tag, so a
   * `cn(...)` spread over several lines is still one subject.
   */
  scope?: "line" | "dialog";
}

/** One Tailwind variant: `md:`, `dark:`, `data-[state=open]:`, `[&>svg]:`. */
const VARIANT = String.raw`(?:\[[^\]]*\]|[a-z0-9@_-]+(?:\[[^\]]*\])?):`;

export const RULES: Rule[] = [
  {
    name: "raw colour literal",
    // A hex (3/4/6/8 digits) or an rgb()/rgba() call.
    pattern:
      /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{5}|[0-9a-fA-F]{3}|[0-9a-fA-F])?\b|(?<![a-zA-Z])rgba?\(/,
    remedy:
      "a visual change is a token edit (packages/design-tokens/tokens/*.json), never a literal — DESIGN.md §3.1",
  },
  {
    name: "raw Tailwind palette colour",
    // `text-red-400`, `bg-emerald-950`, `border-zinc-700`: Tailwind's own
    // palette, which no Houston token feeds. It bypasses the theme exactly as a
    // hex does — the hue is frozen at the value the author typed and neither
    // theme can move it.
    pattern:
      /\b(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|inset-ring|inset-shadow|outline|divide(?:-[xy])?|fill|stroke|from|via|to|placeholder|caret|decoration|shadow|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    remedy:
      "status wears the semantic pair (danger/success/warning plus their -text and -ink), neutrals wear ink, ink-muted, chip and line — DESIGN.md §4",
  },
  {
    name: "undefined CSS variable",
    // shadcn's `hsl(var(--sidebar-border))` shape. The var resolves to nothing
    // here, so the whole declaration is dropped and the pixel looks unstyled.
    pattern: /hsl\(\s*var\(--[a-z0-9-]+\)\s*\)/,
    remedy:
      "use the Houston utility (bg-*/text-*/border-* on a --ht-* token) — DESIGN.md §4",
  },
  {
    name: "viewport height",
    // `dvh` is the one that survives collapsing mobile browser chrome.
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
    // A `max-w-*` utility whose variant stack carries no `sm:` anywhere. The
    // lookbehind pins the match to the START of a class token, so `sm:max-w-lg`
    // cannot be re-entered at its `max-w-` and pass as an offence.
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

/** `app/src` etc. plus every `ui/<pkg>/src`. */
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
    // Fixture data is not a pixel: it never renders.
    if (name === "__fixtures__") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Blank out every comment, keeping the line count intact.
 *
 * Prose cites issue numbers (`#401`), names the colour formats a parser
 * accepts and explains which token a value came from — none of that is a
 * pixel. Only authored VALUES are, so only code is scanned. `//` is spared
 * after a colon so a `https://` inside a string survives.
 */
function blankComments(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, lead: string) =>
      lead === "" ? blank(match) : lead + blank(match.slice(lead.length)),
    );
}

/** Every file the rules apply to, repo-relative and sorted. */
export function guardedFiles(): string[] {
  const sanctioned = new Set(SANCTIONED);
  return sourceRoots()
    .flatMap((root) => walk(root))
    .map((file) => relative(REPO, file))
    .filter((file) => !sanctioned.has(file))
    .sort();
}

/** The tags a `dialog`-scoped rule judges. */
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
