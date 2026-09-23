import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
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
    const css = readFileSync(
      join(import.meta.dirname, "../src/canvas.css"),
      "utf8",
    );
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
