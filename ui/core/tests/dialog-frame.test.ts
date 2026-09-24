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

/**
 * The frame is ONE thing: the delete confirm's, worn by every dialog. These
 * assert that the two primitives cannot drift apart again — not that the
 * values are pretty, but that a change to either one changes both.
 */

/**
 * The classes that ARE the frame: the surface's shape and the type inside it.
 * Variant-prefixed classes are each primitive's own business (a size, a
 * breakpoint, a media slot), so they are left out of the comparison.
 */
const FRAME_ASPECT = /^(rounded|border|shadow|p|px|py|gap|text|font|bg)(-|$)/;

/** A stylesheet ui/core ships, read from disk: the cascade is the assertion. */
const sheet = (name: string): string =>
  readFileSync(join(import.meta.dirname, "../src", name), "utf8");

/** Split a selector LIST on its top-level commas, so `:where(a, b)` stays whole. */
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

/** A stylesheet with its comments removed: what the browser actually reads. */
const code = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The RULES of one numbered canvas.css section, comments stripped: the slice
 * starts after the section header's own comment closes, so what comes back is
 * only what the browser reads for that section.
 */
const canvasSection = (n: number): string => {
  const css = sheet("canvas.css");
  const heading = css.indexOf(`─ ${n}. `);
  const next = css.indexOf(`─ ${n + 1}. `);
  assert.ok(heading > 0 && next > heading, `canvas.css has no section ${n}`);
  return code(css.slice(css.indexOf("*/", heading) + 2, next));
};

/**
 * Every selector a stylesheet declares, one per element a rule paints, written
 * on one line: whitespace collapsed, and the padding a wrapped `:not(…)` picks
 * up removed, so a selector compares the same however it is formatted. The regex
 * matches the INNERMOST blocks, so a rule nested in an `@media` query is read as
 * its own selector rather than hiding behind the query's prelude.
 */
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

/** The dark-scoped rules that paint a DESCENDANT (not the [data-theme] host). */
const darkDescendants = (css: string): string[] =>
  selectors(css).filter((selector) =>
    /^\[data-theme="dark"\]\s\S/.test(selector),
  );

const frameTokens = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((cls) => cls && !cls.includes(":") && FRAME_ASPECT.test(cls))
    .sort();

/**
 * The class a recipe builds for its surface.
 *
 * Read off the element rather than rendered markup because Radix mounts
 * content in a portal, which server rendering never runs — an open dialog
 * renders an empty string. Both content components are plain functions with no
 * hooks, so calling one returns exactly the tree it would mount.
 */
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

/** The header, title and description all need their dialog's context. */
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
    // Spelled out, so a drift that moves BOTH still has to be deliberate.
    // `rounded-2xl` is the tokens' `xxl` 16px — DESIGN.md §4 gives dialogs and
    // large cards that radius, and shadcn's `rounded-lg` is not it.
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
    // DESIGN.md §6 bans a dark-mode drop shadow laid over the aurora, so the
    // frame cannot wear one shadow tinted twice. `shadow-lg` (shadcn's) has no
    // dark rule at all, and an arbitrary `shadow-[…rgba…]` would be a raw
    // colour literal inside `ui/` (§3.1) — both are how the frame drifted. The
    // token carries a light AND a dark value and re-resolves inside a pinned
    // subtree, so the class is ONE rule reading it.
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
    // `.ht-shadow-dialog` is specificity (0,1,0); `[data-theme="dark"]
    // .bg-dialog` is (0,2,0) and box-shadow does not accumulate, so the sheen
    // rule REPLACED the whole tier and a framed dark dialog floated on nothing
    // but a 1px highlight. So the sheen is the tier's own first layer, and the
    // rule that paints an UNFRAMED dark dialog surface excludes the framed one.
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
    // DESIGN.md: a caller sizes a dialog with `sm:max-w-*`. An unprefixed cap
    // is tailwind-merged over the gutter and the dialog goes edge-to-edge.
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
    // The alert's default width must be a plain `sm:max-w-lg` too: a default
    // guarded by `data-[size=default]:` survives tailwind-merge AND outranks
    // the caller's rule on specificity, so the caller's width is silently
    // dead. The merged result has to carry the caller's cap alone.
    const alert = contentClass(AlertDialogContent, {
      className: "sm:max-w-md",
    });
    assert.match(alert, /\bsm:max-w-md\b/);
    assert.doesNotMatch(alert, /sm:max-w-lg\b/);
  });

  it("lets a child clip instead of pushing the surface past its width", () => {
    // PRODUCT-1231: an implicit auto track refuses to shrink below its
    // content's min-content width, so one nowrap child widened the dialog.
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
    // One scrim, not two: the confirm and the form dialog had inherited
    // different washes, so the page behind them darkened by different amounts
    // depending on which dialog was open.
    assert.match(DIALOG_OVERLAY_CLASS, /\bbg-black\/25\b/);
  });
});

describe("the frame's breakpoints", () => {
  /**
   * DESIGN.md §3.8: one edge, 768px (`md:`), and the ONE sanctioned `sm:` is a
   * dialog's max-width (`DialogContent`'s unprefixed cap is the phone gutter).
   * The frame arrived carrying shadcn's 640px `sm:` for LAYOUT — alignment,
   * the footer row, the alert's media tracks — which put the dialog's own
   * layout on a breakpoint nothing else in the product uses.
   */
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
    // Unguarded on purpose: guarded by `data-[size=default]:` it would
    // survive tailwind-merge and outrank a caller's own `sm:max-w-*`.
    assert.match(ALERT_DIALOG_CONTENT_CLASS, /(^|\s)sm:max-w-lg\b/);
  });

  it("moves the confirm's media beside its title at md:, not sm:", () => {
    // The alert's own additions on top of the frame: the header's desktop
    // tracks, the title's second column, the media slot's row span.
    assert.match(
      ALERT_DIALOG_HEADER_CLASS,
      /md:group-data-\[size=default\]\/alert-dialog-content:place-items-start/,
    );
    assert.match(ALERT_DIALOG_TITLE_CLASS, /^md:group-data-\[size=default\]/);
    assert.match(ALERT_DIALOG_MEDIA_CLASS, /\bmd:group-data-\[size=default\]/);
    assert.match(ALERT_DIALOG_MEDIA_CLASS, /\bsize-16\b/);
  });

  it("splits the narrow confirm's two buttons down the middle at every width", () => {
    // A two-up grid, not a breakpoint: `sm` is the phone-sized confirm and it
    // looks the same on a desktop.
    assert.match(
      ALERT_DIALOG_FOOTER_CLASS,
      /group-data-\[size=sm\]\/alert-dialog-content:grid-cols-2/,
    );
  });
});

/**
 * The two stylesheets the frame shares with the rest of ui/core. The dialog's
 * own dark sheen is one of the rules swept here, which is why the invariants sit
 * beside it rather than in a sheet-shaped test of their own.
 */
describe("the shared stylesheets", () => {
  const LIGHT_PIN_GUARD =
    ':not(:where([data-theme="light"], [data-theme="light"] *))';

  it("pins every dark rule inside the tree against a light-pinned subtree", () => {
    // DESIGN.md §3.4: a subtree pinned with data-theme="light" (the sign-in
    // card, the first-run canvas) must get the LIGHT chrome, and a dark
    // descendant rule keeps matching through the <html data-theme="dark">
    // ancestor unless it says otherwise.
    for (const selector of darkDescendants(sheet("canvas.css"))) {
      // The aurora paints the page backdrop; a pinned subtree cannot contain
      // <body>, so those rules need no guard.
      if (/^\[data-theme="dark"\] (body|html)\b/.test(selector)) continue;
      assert.ok(
        selector.includes(LIGHT_PIN_GUARD),
        `${selector} leaks the dark look into a light-pinned subtree`,
      );
    }
  });

  it("paints the primary button from the cta tokens alone", () => {
    // DESIGN.md §4: `bg-cta`/`text-cta-text` (plus the rim pair) ARE the filled
    // primary button, so an imported palette repaints it by declaring its own
    // values. A literal in this section is Houston's look nailed into every
    // palette — the bug where "New task" stayed near-ink on an imported set.
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
    // DESIGN.md §7: focus is a ≥2px ring drawn as a box-shadow so it follows
    // the radius. Button's base ring is Tailwind's `ring-[3px]`, itself a
    // box-shadow, so §4's unlayered rim shadow replaces it outright, and the
    // `focus-visible:border-focus` beside it colours a border with no width:
    // the primary button showed no focus at all. One box-shadow slot holds
    // both, so §4 paints the rim and the ring together.
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
    // The focus rule restates the RESTING rim, and it has to come last so the
    // ring survives a hover, so hover + focus together would take the resting
    // rim back: the button would lose its hover the moment it is also focused.
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
    // A mask reads the ALPHA channel only, so any opaque colour does the job,
    // but `currentColor` resolves to the host's TEXT colour, alpha included, so
    // a `text-ink/70` ancestor faded the comet to 70% with it. A keyword is not
    // a raw colour literal (§3.1 bans hex/rgba), and it is always opaque.
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
    // The confirm's Cancel is an outline Button; a form's way out is the same
    // control doing the same job, so it wears the same variant.
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
