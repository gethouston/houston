import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { shadow } from "@houston/design-tokens";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../src/components/alert-dialog.tsx";
import {
  ALERT_DIALOG_CONTENT_CLASS,
  ALERT_DIALOG_FOOTER_CLASS,
  ALERT_DIALOG_HEADER_CLASS,
  ALERT_DIALOG_MEDIA_CLASS,
  ALERT_DIALOG_TITLE_CLASS,
} from "../src/components/alert-dialog-parts.ts";
import { Button } from "../src/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../src/components/dialog.tsx";
import {
  DIALOG_CONTENT_CLASS,
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_FRAME_CLASS,
  DIALOG_OVERLAY_CLASS,
} from "../src/components/dialog-frame.ts";
import { FormDialogForm } from "../src/components/form-dialog-form.tsx";
import { resolveSecondary } from "../src/components/form-dialog-parts.ts";

Object.assign(globalThis, { React });
const { createElement } = React;

const FRAME_ASPECT = /^(rounded|border|shadow|p|px|py|gap|text|font|bg)(-|$)/;

const sheet = (name: string): string =>
  readFileSync(join(import.meta.dirname, "../src", name), "utf8");

function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

const code = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const canvasSection = (n: number): string => {
  const css = sheet("canvas.css");
  const heading = css.indexOf(`─ ${n}. `);
  const next = css.indexOf(`─ ${n + 1}. `);
  assert.ok(heading > 0 && next > heading, `canvas.css has no section ${n}`);
  return code(css.slice(css.indexOf("*/", heading) + 2, next));
};

const selectors = (css: string): string[] =>
  [...code(css).matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .flatMap((rule) => splitSelectorList(rule[1]))
    .map((selector) =>
      selector
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")"),
    )
    .filter(Boolean);

const darkDescendants = (css: string): string[] =>
  selectors(css).filter((selector) =>
    /^\[data-theme="dark"\]\s\S/.test(selector),
  );

const frameTokens = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((cls) => cls && !cls.includes(":") && FRAME_ASPECT.test(cls))
    .sort();

function contentClass(
  content: typeof DialogContent | typeof AlertDialogContent,
  props: Record<string, unknown> = {},
): string {
  const tree = (content as (p: Record<string, unknown>) => React.ReactNode)({
    children: null,
    ...props,
  });
  const found = findBySlotSuffix(tree, "dialog-content");
  assert.ok(found, "the recipe renders no dialog-content element");
  return String(found.props.className ?? "");
}

function findBySlotSuffix(
  node: React.ReactNode,
  suffix: string,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findBySlotSuffix(child, suffix);
      if (found) return found;
    }
    return undefined;
  }
  if (!React.isValidElement(node)) return undefined;
  const props = node.props as Record<string, unknown>;
  if (String(props["data-slot"] ?? "").endsWith(suffix)) {
    return node as React.ReactElement<Record<string, unknown>>;
  }
  return findBySlotSuffix(props.children as React.ReactNode, suffix);
}

function part(
  root: typeof Dialog | typeof AlertDialog,
  child: React.ReactNode,
): string {
  const html = renderToStaticMarkup(
    createElement(root, { open: true, onOpenChange: () => undefined }, child),
  );
  return /class="([^"]*)"/.exec(html)?.[1] ?? "";
}

const dialogPart = (child: React.ReactNode) => part(Dialog, child);
const alertPart = (child: React.ReactNode) => part(AlertDialog, child);

describe("the dialog frame", () => {
  it("gives both primitives the same surface", () => {
    const dialog = contentClass(DialogContent);
    const alert = contentClass(AlertDialogContent);
    assert.deepEqual(frameTokens(dialog), frameTokens(alert));
    assert.deepEqual(frameTokens(dialog), [
      "bg-dialog",
      "border",
      "border-line/50",
      "gap-4",
      "p-6",
      "rounded-2xl",
    ]);
  });

  it("takes its depth from the `dialog` elevation tier, themed by the token", () => {
    const css = sheet("canvas.css");
    for (const content of [DialogContent, AlertDialogContent]) {
      const classes = contentClass(content);
      assert.match(classes, /\bht-shadow-dialog\b/);
      assert.doesNotMatch(classes, /\bshadow-lg\b/);
      assert.doesNotMatch(classes, /shadow-\[/, "no raw shadow literal in ui/");
    }
    assert.match(
      css,
      /^\.ht-shadow-dialog \{\n\s*box-shadow: var\(--ht-shadow-dialog\);\n\}/m,
      "one rule, reading the themed token",
    );
    assert.doesNotMatch(
      css,
      /\.ht-shadow-dialog:not\(/,
      "a dark fork means the token stopped carrying the dark value",
    );
  });

  it("keeps that depth in dark, with the glass sheen inside the tier", () => {
    assert.match(
      shadow.dark.dialog,
      /^inset 0 1px 0 0 rgba\(255, 255, 255, 0\.06\)/,
      "the dark tier opens with the sheen",
    );
    assert.match(
      shadow.dark.dialog,
      /0 4px 80px 8px/,
      "the ambient depth is still under it",
    );
    const sheen = darkDescendants(sheet("canvas.css")).filter((selector) =>
      selector.includes(".bg-dialog"),
    );
    assert.equal(sheen.length, 1, "one dark rule paints the dialog surface");
    assert.ok(
      sheen[0].includes(".bg-dialog:not(:where(.ht-shadow-dialog))"),
      `${sheen[0]} still outranks .ht-shadow-dialog`,
    );
  });

  it("keeps each caller's width rule, and the phone gutter under it", () => {
    const dialog = contentClass(DialogContent);
    assert.match(dialog, /\bmax-w-\[calc\(100%-2rem\)\]/);
    assert.match(dialog, /\bsm:max-w-lg\b/);
    assert.match(
      contentClass(AlertDialogContent),
      /\bmax-w-\[calc\(100%-2rem\)\]/,
    );
    assert.match(
      contentClass(DialogContent, { className: "sm:max-w-md" }),
      /\bsm:max-w-md\b/,
    );
    const alert = contentClass(AlertDialogContent, {
      className: "sm:max-w-md",
    });
    assert.match(alert, /\bsm:max-w-md\b/);
    assert.doesNotMatch(alert, /sm:max-w-lg\b/);
  });

  it("lets a child clip instead of pushing the surface past its width", () => {
    for (const content of [DialogContent, AlertDialogContent]) {
      assert.match(contentClass(content), /\bgrid-cols-\[minmax\(0,1fr\)\]/);
    }
  });

  it("stacks the header the same way in both", () => {
    const dialog = dialogPart(createElement(DialogHeader, null, "Header"));
    const alert = alertPart(createElement(AlertDialogHeader, null, "Header"));
    assert.deepEqual(frameTokens(dialog), frameTokens(alert));
    assert.deepEqual(frameTokens(dialog), ["gap-1.5", "text-center"]);
  });

  it("sets both titles in the same type", () => {
    const dialog = dialogPart(
      createElement(DialogTitle, null, "Delete agent?"),
    );
    const alert = alertPart(
      createElement(AlertDialogTitle, null, "Delete agent?"),
    );
    assert.deepEqual(frameTokens(dialog), frameTokens(alert));
    assert.deepEqual(frameTokens(dialog), ["font-semibold", "text-lg"]);
  });

  it("sets both descriptions in the same type", () => {
    const dialog = dialogPart(
      createElement(DialogDescription, null, "This cannot be undone."),
    );
    const alert = alertPart(
      createElement(AlertDialogDescription, null, "This cannot be undone."),
    );
    assert.deepEqual(frameTokens(dialog), frameTokens(alert));
    assert.deepEqual(frameTokens(dialog), ["text-ink-muted", "text-sm"]);
  });

  it("puts the actions in the same row, at the same gap", () => {
    const dialog = dialogPart(createElement(DialogFooter, null, "Actions"));
    const alert = alertPart(createElement(AlertDialogFooter, null, "Actions"));
    assert.deepEqual(frameTokens(dialog), frameTokens(alert));
    assert.deepEqual(frameTokens(dialog), ["gap-2"]);
    for (const classes of [dialog, alert]) {
      assert.match(classes, /\bflex-col-reverse\b/);
      assert.match(classes, /\bmd:justify-end\b/);
    }
  });

  it("dims the page behind it at ONE weight, in both primitives", () => {
    assert.match(DIALOG_OVERLAY_CLASS, /\bbg-black\/25\b/);
  });
});

describe("the frame's breakpoints", () => {
  const LAYOUT_SM = /\bsm:(?!max-w-)[a-z]/;

  it("changes layout only at the product's own edge", () => {
    for (const [name, classes] of Object.entries({
      DIALOG_CONTENT_CLASS,
      DIALOG_HEADER_FRAME_CLASS,
      DIALOG_FOOTER_CLASS,
      DIALOG_OVERLAY_CLASS,
      ALERT_DIALOG_CONTENT_CLASS,
      ALERT_DIALOG_HEADER_CLASS,
      ALERT_DIALOG_FOOTER_CLASS,
      ALERT_DIALOG_TITLE_CLASS,
      ALERT_DIALOG_MEDIA_CLASS,
    })) {
      assert.doesNotMatch(classes, LAYOUT_SM, `${name} lays out at sm:`);
    }
  });

  it("still sizes the alert's two widths at sm:, the one exception", () => {
    assert.match(ALERT_DIALOG_CONTENT_CLASS, /\bdata-\[size=sm\]:max-w-xs\b/);
    assert.match(ALERT_DIALOG_CONTENT_CLASS, /(^|\s)sm:max-w-lg\b/);
  });

  it("moves the confirm's media beside its title at md:, not sm:", () => {
    assert.match(
      ALERT_DIALOG_HEADER_CLASS,
      /md:group-data-\[size=default\]\/alert-dialog-content:place-items-start/,
    );
    assert.match(ALERT_DIALOG_TITLE_CLASS, /^md:group-data-\[size=default\]/);
    assert.match(ALERT_DIALOG_MEDIA_CLASS, /\bmd:group-data-\[size=default\]/);
    assert.match(ALERT_DIALOG_MEDIA_CLASS, /\bsize-16\b/);
  });

  it("splits the narrow confirm's two buttons down the middle at every width", () => {
    assert.match(
      ALERT_DIALOG_FOOTER_CLASS,
      /group-data-\[size=sm\]\/alert-dialog-content:grid-cols-2/,
    );
  });
});

describe("the shared stylesheets", () => {
  const LIGHT_PIN_GUARD =
    ':not(:where([data-theme="light"], [data-theme="light"] *))';

  it("pins every dark rule inside the tree against a light-pinned subtree", () => {
    for (const selector of darkDescendants(sheet("canvas.css"))) {
      if (/^\[data-theme="dark"\] (body|html)\b/.test(selector)) continue;
      assert.ok(
        selector.includes(LIGHT_PIN_GUARD),
        `${selector} leaks the dark look into a light-pinned subtree`,
      );
    }
  });

  it("paints the primary button from the cta tokens alone", () => {
    const section = canvasSection(4);
    assert.doesNotMatch(
      section,
      /#[0-9a-fA-F]{3,8}\b|(?<![a-zA-Z])rgba?\(/,
      "section 4 carries a raw colour; the button's colours are tokens",
    );
    for (const role of [
      "cta",
      "cta-text",
      "cta-hover",
      "cta-rim",
      "cta-rim-hover",
    ]) {
      assert.match(section, new RegExp(`var\\(--ht-${role}\\)`), role);
    }
  });

  it("keeps the keyboard focus ring visible on the primary button", () => {
    const rule = [...canvasSection(4).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
      (match) => match[1].includes(":focus-visible"),
    );
    assert.ok(rule, "section 4 draws no focus ring on the primary button");
    assert.match(rule[1], /\[data-variant="default"\]:is\(button, a\)/);
    const declarations = rule[2].replace(/\s+/g, " ");
    assert.match(
      declarations,
      /box-shadow:[^;]*\binset 0 0 0 1px var\(--ht-cta-rim\)/,
      "the focus rule drops the rim the base rule paints",
    );
    assert.match(
      declarations,
      /box-shadow:[^;]*\b0 0 0 3px var\(--ht-focus\)/,
      "the focus rule paints no ring in the focus token",
    );
  });

  it("keeps the hover rim under the ring when the pointer rests on it", () => {
    const rule = [...canvasSection(4).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
      (match) => match[1].includes(":hover:focus-visible"),
    );
    assert.ok(
      rule,
      "section 4 drops the hover rim on a focused primary button",
    );
    const declarations = rule[2].replace(/\s+/g, " ");
    assert.match(
      declarations,
      /box-shadow:[^;]*\binset 0 0 0 1px var\(--ht-cta-rim-hover\)/,
    );
    assert.match(declarations, /box-shadow:[^;]*\b0 0 0 3px var\(--ht-focus\)/);
  });

  it("masks the running ring with a colour of its own", () => {
    const css = code(sheet("motion.css"));
    assert.doesNotMatch(css, /currentColor/);
    assert.equal(
      (css.match(/linear-gradient\(black 0 0\)/g) ?? []).length,
      4,
      "both mask declarations, two layers each",
    );
  });
});

describe("the second button", () => {
  it("is the confirm's Cancel in a form dialog too", () => {
    assert.equal(
      resolveSecondary(undefined, "Cancel", () => undefined).variant,
      "outline",
    );

    const html = renderToStaticMarkup(
      createElement(FormDialogForm, {
        primary: { label: "Save name" },
        secondary: resolveSecondary(undefined, "Cancel", () => undefined),
        pending: false,
        onSubmit: () => undefined,
        children: null,
      }),
    );
    const secondary = /<button[^>]*class="([^"]*)"[^>]*>Cancel/.exec(html)?.[1];
    const outline = /class="([^"]*)"/.exec(
      renderToStaticMarkup(
        createElement(Button, { variant: "outline" }, "Cancel"),
      ),
    )?.[1];
    assert.ok(secondary, html);
    assert.equal(secondary, outline);
  });

  it("stays destructive when the caller says so", () => {
    assert.equal(
      resolveSecondary(
        { label: "Discard", variant: "destructive" },
        "Cancel",
        () => undefined,
      ).variant,
      "destructive",
    );
  });
});
