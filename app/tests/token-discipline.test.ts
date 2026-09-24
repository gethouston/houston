import { deepStrictEqual, ok } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { openingTags } from "./jsx-tags.ts";
import {
  DIALOG_TAG,
  guardedFiles,
  REPO,
  RULES,
  SANCTIONED,
  scan,
  sourceRoots,
  walk,
} from "./token-discipline-rules.ts";

/**
 * Houston's palette is the `--ht-*` token set, re-exported to Tailwind as
 * `--color-*` in `ui/core/src/globals.css`. shadcn's DEFAULT colour names —
 * `foreground`, `muted-foreground`, `primary`, `secondary`, `accent`,
 * `destructive`, `border`, `ring` — were never defined here, so Tailwind emits
 * no utility for them at all: `text-muted-foreground` is not a muted gray, it
 * is nothing, and the text silently keeps whatever it inherited. `border
 * border-border` still draws a hairline only because `globals.css` paints every
 * border `--ht-line` in its base layer; the class itself does nothing.
 *
 * They arrive by copy-paste from the shadcn registry and from any model that
 * learned Tailwind on shadcn's tokens, and a dead class is invisible in review
 * — the pixel it should have changed simply looks unstyled. Hence a source
 * guard rather than a convention: the semantic token exists for every one of
 * them (`text-ink`, `text-ink-muted`, `bg-action`, `text-danger`, `border-line`,
 * `ring-focus`), and `DESIGN.md` §4 is the map.
 */
const GLOBALS = join(REPO, "ui", "core", "src", "globals.css");

/** shadcn default colour names Houston never defined. */
const DEAD_TOKENS = [
  "sidebar-ring",
  "foreground",
  "muted",
  "muted-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "ring",
  "card-foreground",
  "popover-foreground",
  "ring-offset-background",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
];

/** Every Tailwind utility family that takes a colour. */
const COLOR_UTILITIES =
  "bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|decoration|shadow|accent";

const DEAD_CLASS = new RegExp(
  `\\b(?:${COLOR_UTILITIES})-(?:${DEAD_TOKENS.map((t) => t.replace(/-/g, "\\-"))
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "g",
);

/**
 * The inventory of files still holding a raw colour. It is EMPTY: every surface
 * Houston renders draws its visual values from the token set.
 *
 * It stays here because an empty list is the only honest way to take a future
 * offender: the list may only SHRINK, a new offender fails the guard, and a
 * file cleaned without being struck from the list fails it too. So a raw colour
 * that has to land is inventoried deliberately, with the decision it waits on
 * named, and can never be exempted the way a plain ignore file exempts things.
 */
const UNTOKENIZED: string[] = [];

describe("no dead theme tokens in the app or the ui packages", () => {
  it("every guarded name really is undefined in the token set", () => {
    // The guard's own premise: should one of these ever become a REAL Houston
    // token, this fails first and says to drop it from the list rather than
    // banning a live utility.
    const globals = readFileSync(GLOBALS, "utf8");
    const defined = DEAD_TOKENS.filter((token) =>
      new RegExp(`--color-${token}\\s*:`).test(globals),
    );
    deepStrictEqual(defined, []);
  });

  it("no source file wears a shadcn-default colour class", () => {
    const offenders: string[] = [];
    for (const file of guardedFiles()) {
      const source = readFileSync(join(REPO, file), "utf8");
      for (const match of source.match(DEAD_CLASS) ?? []) {
        offenders.push(`${file}: ${match}`);
      }
    }
    deepStrictEqual(offenders, []);
  });
});

describe("no raw visual values outside the sanctioned files", () => {
  it("guards every surface that renders Houston's UI", () => {
    // A guard that silently stopped matching anything would pass forever.
    const roots = sourceRoots().map((root) => root.replace(`${REPO}/`, ""));
    for (const expected of [
      "app/src",
      "packages/web/src",
      "packages/engine-adapter/src",
      "agentstore/src",
      "ui/showcase/specimens",
      "ui/core/src",
      "ui/chat/src",
    ]) {
      ok(roots.includes(expected), `${expected} is not scanned`);
    }
    ok(guardedFiles().length > 800, "the walk found almost nothing");
  });

  it("names only files that exist, in both lists", () => {
    // DESIGN.md §3.1 is mirrored here by hand; a rename that left this behind
    // would quietly exempt nothing and guard a ghost.
    for (const file of [...SANCTIONED, ...UNTOKENIZED]) {
      ok(existsSync(join(REPO, file)), `${file} no longer exists`);
    }
  });

  it("has a remedy for every rule it enforces", () => {
    for (const rule of RULES) ok(rule.remedy.length > 20, rule.name);
  });

  it("finds no raw hex, rgba, palette class, undefined var, vh height, max-md: or bare dialog width", () => {
    const known = new Set(UNTOKENIZED);
    const offences = guardedFiles()
      .filter((file) => !known.has(file))
      .flatMap((file) => scan(file))
      .map((o) => `${o.file}:${o.line} [${o.rule}] ${o.text.slice(0, 90)}`);
    deepStrictEqual(offences, []);
  });

  it("keeps the outstanding inventory shrinking, never rotting", () => {
    // A file cleaned up but left on the list turns the list into a permanent
    // allowlist. Striking it is part of fixing it.
    const stale = UNTOKENIZED.filter((file) => scan(file).length === 0);
    deepStrictEqual(
      stale,
      [],
      "these are clean now — delete them from the list",
    );
  });

  it("lists both sets sorted, so a merge cannot hide a new entry", () => {
    deepStrictEqual(UNTOKENIZED, [...UNTOKENIZED].sort());
  });
});

/**
 * The dialog frame caps its width at `max-w-[calc(100%-2rem)]` — that cap IS
 * the phone gutter. tailwind-merge keeps the LAST utility of a family, so one
 * unprefixed `max-w-lg` at a call site deletes the gutter and the dialog runs
 * edge to edge on a phone; `sm:max-w-lg` sizes the desktop dialog and leaves
 * the gutter standing. The width is the ONE place `sm:` is legal (DESIGN.md
 * §3.8), so a bare `max-w-*` on a dialog is always the bug.
 */
describe("the dialog-width rule", () => {
  const rule = RULES.find((r) => r.name === "dialog width without sm:");
  const offends = (source: string) =>
    openingTags(source, DIALOG_TAG).some((tag) => {
      ok(rule, "the rule is still registered");
      return rule.pattern.test(tag.text);
    });

  it("reads the whole opening tag, not the line the class sits on", () => {
    ok(
      offends(`<DialogContent
        className={cn(
          "grid gap-4",
          "max-w-lg",
        )}
      >`),
      "a cn() spread over lines is still one subject",
    );
  });

  it("passes a width that keeps the phone gutter", () => {
    ok(!offends('<DialogContent className="sm:max-w-lg">'));
    ok(!offends('<AlertDialogContent className="p-0 sm:max-w-[95vw]">'));
  });

  it("is not fooled by a variant stack or a `>` inside a class", () => {
    ok(!offends('<DialogContent className="dark:sm:max-w-lg">'));
    ok(offends('<DialogContent className="[&>svg]:size-4 md:max-w-lg">'));
  });

  it("judges dialogs only — a card is free to cap its own width", () => {
    ok(!offends('<div className="max-w-lg">'));
  });
});

/**
 * Tailwind's palette scales are as hardcoded as a hex: `text-red-400` names a
 * frozen hue no `[data-theme]` can move. The rule has to tell them apart from
 * Houston's own numbered-looking families, which are token-backed identities.
 */
describe("the raw-palette rule", () => {
  const rule = RULES.find((r) => r.name === "raw Tailwind palette colour");
  const offends = (text: string) => {
    ok(rule, "the rule is still registered");
    return rule.pattern.test(text);
  };

  it("catches a Tailwind palette scale on any colour utility", () => {
    ok(offends('<p className="text-red-400">'));
    ok(offends('<div className="bg-emerald-950 border-zinc-700">'));
    ok(offends('<div className="border-t-red-500 ring-offset-red-500">'));
    ok(offends('<ul className="divide-y divide-y-gray-200">'));
    ok(offends('<p className="hover:text-red-400/50">'));
  });

  it("is not fooled by a keyword colour or a non-colour scale", () => {
    ok(
      !offends(
        '<p className="text-white bg-black/50 ring-offset-2 border-b-2">',
      ),
    );
  });

  it("leaves Houston's semantic and identity tokens alone", () => {
    ok(!offends('<p className="text-danger">'));
    ok(!offends('<p className="text-filetype-pdf">'));
    ok(!offends('<p className="text-success-ink bg-warning/10 border-line">'));
  });
});

describe("the walker", () => {
  it("reads TS, TSX and CSS, and nothing else", () => {
    const files = walk(join(REPO, "ui", "core", "src"));
    ok(
      files.some((f) => f.endsWith(".css")),
      "CSS is where raw values hide",
    );
    ok(files.some((f) => f.endsWith(".tsx")));
    ok(!files.some((f) => /\.(json|md|svg)$/.test(f)));
  });

  it("skips __fixtures__, whose data never renders", () => {
    const files = walk(join(REPO, "agentstore", "src", "lib", "export"));
    ok(files.length > 0, "the export dir still has sources to walk");
    ok(!files.some((f) => f.includes("__fixtures__")));
  });
});
