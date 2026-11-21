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

const GLOBALS = join(REPO, "ui", "core", "src", "globals.css");

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

const COLOR_UTILITIES =
  "bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|decoration|shadow|accent";

const DEAD_CLASS = new RegExp(
  `\\b(?:${COLOR_UTILITIES})-(?:${DEAD_TOKENS.map((t) => t.replace(/-/g, "\\-"))
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "g",
);

const UNTOKENIZED: string[] = [];

describe("no dead theme tokens in the app or the ui packages", () => {
  it("every guarded name really is undefined in the token set", () => {
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
