import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Dialog,
  DialogCloseButton,
  DialogContent,
} from "../src/components/dialog.tsx";
import {
  DIALOG_CLOSE_CLASS,
  DIALOG_CLOSE_CORNER_CLASS,
} from "../src/components/dialog-frame.ts";
import { FlowSheet } from "../src/components/flow-sheet.tsx";
import { FlowSheetCompactHeader } from "../src/components/flow-sheet-compact-header.tsx";
import {
  FLOW_SHEET_BODY_CLASSES,
  FLOW_SHEET_CONTENT_CLASSES,
  FLOW_SHEET_FOOTER_CLASSES,
  FlowSheetHeader,
} from "../src/components/flow-sheet-parts.tsx";

Object.assign(globalThis, { React });
const { createElement } = React;

/** The header needs the dialog context for its title and close control. */
function header(props: Parameters<typeof FlowSheetHeader>[0]): string {
  return renderToStaticMarkup(
    createElement(
      Dialog,
      { open: true, onOpenChange: () => undefined },
      createElement(FlowSheetHeader, props),
    ),
  );
}

function compactHeader(
  props: Parameters<typeof FlowSheetCompactHeader>[0],
): string {
  return renderToStaticMarkup(
    createElement(
      Dialog,
      { open: true, onOpenChange: () => undefined },
      createElement(FlowSheetCompactHeader, props),
    ),
  );
}

function findCloseButton(
  node: React.ReactNode,
): React.ReactElement<{ className?: string }> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findCloseButton(child);
      if (found) return found;
    }
    return undefined;
  }
  if (!React.isValidElement(node)) return undefined;
  if (node.type === DialogCloseButton) {
    return node as React.ReactElement<{ className?: string }>;
  }
  const props = node.props as { children?: React.ReactNode };
  return findCloseButton(props.children);
}

const slotOrder = (html: string): string[] =>
  [...html.matchAll(/data-slot="(flow-sheet-[a-z]+)"/g)].map((m) => m[1]);

describe("the FlowSheet header", () => {
  it("renders its three slots in one fixed order, empty or not", () => {
    // The frame must not move between steps: a header that re-centres itself
    // when Back appears is the tell that a flow was assembled per-step.
    assert.deepEqual(
      slotOrder(header({ title: "Copy agent", closeLabel: "Close" })),
      [
        "flow-sheet-header",
        "flow-sheet-back",
        "flow-sheet-progress",
        "flow-sheet-aside",
      ],
    );
    assert.deepEqual(
      slotOrder(
        header({
          title: "Copy agent",
          back: { label: "Back", onClick: () => undefined },
          progress: createElement("div", { "data-testid": "dots" }),
          headerAside: createElement("span", null, "2 of 4"),
          closeLabel: "Close",
        }),
      ),
      [
        "flow-sheet-header",
        "flow-sheet-back",
        "flow-sheet-progress",
        "flow-sheet-aside",
      ],
    );
  });

  it("holds the row to h-12 with equal side tracks around a fixed centre", () => {
    const html = header({ title: "Copy agent", closeLabel: "Close" });
    assert.match(html, /data-slot="flow-sheet-header" class="[^"]*\bh-12\b/);
    assert.match(html, /data-slot="flow-sheet-header" class="[^"]*\bpx-5\b/);
    const sides = [
      ...html.matchAll(
        /data-slot="flow-sheet-(?:back|aside)" class="([^"]*)"/g,
      ),
    ];
    assert.equal(sides.length, 2);
    for (const [, classes] of sides) assert.match(classes, /\bflex-1\b/);
    assert.match(
      html,
      /data-slot="flow-sheet-progress" class="[^"]*\bshrink-0\b/,
      "a growing centre slot would drift as the step's progress changes width",
    );
  });

  it("keeps the title screen-reader-only unless the caller asks for it", () => {
    // A wide step carries its own headline over its content; a second, smaller
    // copy of the flow's name above it says nothing the user needed.
    const plain = header({ title: "Copy agent", closeLabel: "Close" });
    assert.match(
      plain,
      /class="[^"]*\bsr-only"[^>]*>Copy agent</,
      "the flow keeps its accessible name even when nothing shows it",
    );

    const shown = header({
      title: "Copy agent",
      showTitle: true,
      closeLabel: "Close",
    });
    assert.match(shown, /class="[^"]*text-sm[^"]*"[^>]*>Copy agent</);

    const withProgress = header({
      title: "Copy agent",
      showTitle: true,
      progress: createElement("div", null, "Step 2"),
      closeLabel: "Close",
    });
    assert.match(
      withProgress,
      /class="[^"]*\bsr-only"[^>]*>Copy agent</,
      "progress owns the centre slot whenever there is any",
    );
    assert.match(withProgress, />Step 2</);
  });

  it("renders the back control only when the flow has a step behind it", () => {
    assert.doesNotMatch(
      header({ title: "Copy agent", closeLabel: "Close" }),
      />Back</,
    );
    assert.match(
      header({
        title: "Copy agent",
        back: { label: "Back", onClick: () => undefined },
        closeLabel: "Close",
      }),
      />Back</,
    );
  });

  it("names the close control for screen readers, in the caller's language", () => {
    assert.match(
      header({ title: "Copiar agente", closeLabel: "Cerrar" }),
      /Cerrar/,
    );
  });

  it("closes with the dialog's own X, in the frame's one shape", () => {
    // A circle in the wide header and a squircle in the compact corner read
    // as two components; the header X is the corner X, moved into the row.
    const closeClass = (html: string): string =>
      (html.match(/data-slot="dialog-close" class="([^"]*)"/)?.[1] ?? "")
        .replaceAll("&amp;", "&")
        .replaceAll("&#x27;", "'");
    const inHeader = closeClass(
      header({ title: "Copy agent", closeLabel: "Close" }),
    );
    for (const cls of DIALOG_CLOSE_CLASS.split(/\s+/)) {
      assert.ok(inHeader.includes(cls), `header X wears ${cls}`);
    }
    assert.doesNotMatch(inHeader, /rounded-full|size-8/);
    // The only close control of a wide flow: a keyboard user must see it.
    assert.match(DIALOG_CLOSE_CLASS, /focus-visible:ring-/);
    assert.doesNotMatch(DIALOG_CLOSE_CLASS, /(^|\s)focus:outline-hidden/);

    // The portal never renders on the server, so the corner X is read off
    // the tree DialogContent returns: the same component, in the corner.
    const corner = findCloseButton(
      (DialogContent as (p: Record<string, unknown>) => React.ReactNode)({
        children: null,
        closeLabel: "Close",
      }),
    );
    assert.ok(corner, "DialogContent renders no DialogCloseButton");
    assert.equal(corner.props.className, DIALOG_CLOSE_CORNER_CLASS);
  });
});

describe("the FlowSheet frame", () => {
  it("wears the confirm dialog's frame when the step asks one short thing", () => {
    const compact = FLOW_SHEET_CONTENT_CLASSES.compact;
    assert.match(compact, /\bsm:max-w-md\b/);
    // Height from the CONTENT, capped: a two-card choice must not be stretched
    // down a screen-sized surface.
    assert.match(compact, /\bmax-h-\[85dvh\]/);
    assert.doesNotMatch(compact, /(?:^|\s)h-\[85dvh\]/);
    assert.match(compact, /\bp-6\b/);
  });

  it("wears the tall frame when the step is a catalog to scan", () => {
    const wide = FLOW_SHEET_CONTENT_CLASSES.wide;
    // 42rem is `2xl`, wider than the `sm` edge the cap starts at: the gutter
    // has to live inside the cap or the sheet runs edge to edge at 640px.
    assert.match(wide, /\bsm:max-w-\[min\(42rem,calc\(100%-2rem\)\)\]/);
    assert.doesNotMatch(wide, /sm:max-w-2xl/);
    assert.match(wide, /(?:^|\s)h-\[85dvh\]/);
    assert.match(wide, /\bp-0\b/);
  });

  it("never sizes itself in `vh`, and scrolls as ONE surface or not at all", () => {
    for (const classes of Object.values(FLOW_SHEET_CONTENT_CLASSES)) {
      assert.doesNotMatch(classes, /h-screen|85vh/);
      for (const cls of ["flex", "flex-col"]) {
        assert.ok(classes.includes(cls), `${cls} missing from ${classes}`);
      }
    }
    // The wide frame holds a fixed header over a scrolling body, so the sheet
    // itself must never scroll. The compact one has no such parts: past the
    // cap the whole dialog scrolls, title and all, rather than growing a box
    // with its own bar inside a hand-sized surface.
    assert.match(FLOW_SHEET_CONTENT_CLASSES.wide, /\boverflow-hidden\b/);
    assert.match(FLOW_SHEET_CONTENT_CLASSES.compact, /\boverflow-y-auto\b/);
  });

  it("never animates the box it changes between steps", () => {
    // The size switches as the flow walks. Animating a surface's width or
    // height is layout animation; DESIGN.md allows transform and opacity only.
    for (const classes of Object.values(FLOW_SHEET_CONTENT_CLASSES)) {
      assert.doesNotMatch(classes, /\btransition/);
    }
  });

  it("collapses its entrance under reduced motion, at both sizes", () => {
    for (const classes of Object.values(FLOW_SHEET_CONTENT_CLASSES)) {
      assert.match(classes, /motion-reduce:animate-none/);
    }
  });

  it("scrolls the wide body, and makes the compact one no box at all", () => {
    // The wide body is the one element between a fixed header and a pinned
    // bar, so it takes the slack and pays its own gutter.
    assert.match(FLOW_SHEET_BODY_CLASSES.wide, /\boverflow-y-auto\b/);
    assert.match(FLOW_SHEET_BODY_CLASSES.wide, /\bmin-h-0\b/);
    assert.match(FLOW_SHEET_BODY_CLASSES.wide, /\bflex-1\b/);
    assert.match(FLOW_SHEET_BODY_CLASSES.wide, /\bpx-5\b.*\bmd:px-8\b/);
    // The compact body sits inside the dialog's own padding and grows with its
    // content: no padding, no floor, and — above all — no overflow of its own.
    // A scroll container there paints a bar down the side of a question that
    // fits, and the step's 12px entrance scrolls it sideways on every move.
    assert.equal(FLOW_SHEET_BODY_CLASSES.compact, "");
  });

  it("stacks the pinned bar's padding on the home-indicator inset", () => {
    // `pb-safe` alone REPLACES the design padding with an inset that is 0 on
    // desktop, leaving the bar's buttons flush against the edge. Only the wide
    // frame pins a bar; the compact one's actions sit inline in a dialog that
    // is centred well clear of the indicator.
    assert.match(
      FLOW_SHEET_FOOTER_CLASSES.wide,
      /pb-\[calc\(env\(safe-area-inset-bottom\)\+theme\(spacing\.4\)\)\]/,
    );
    for (const classes of Object.values(FLOW_SHEET_FOOTER_CLASSES)) {
      assert.match(classes, /\bshrink-0\b/);
    }
    assert.doesNotMatch(FLOW_SHEET_FOOTER_CLASSES.compact, /\bborder-t\b/);
  });
});

describe("the FlowSheet compact header", () => {
  it("makes the step's question the dialog's own title", () => {
    // Not a small centred label over the content: the compact frame reads as a
    // confirm dialog, so the question is the title and the cards sit under it.
    const html = compactHeader({ title: "What do you want to add?" });
    assert.match(
      html,
      /data-slot="dialog-title"[^>]*>What do you want to add\?</,
    );
    assert.doesNotMatch(html, /sr-only/);
  });

  it("puts the way back inline before the title, and only when there is one", () => {
    assert.doesNotMatch(compactHeader({ title: "Create a team" }), /Back</);
    const html = compactHeader({
      title: "Create a team",
      back: { label: "Back", onClick: () => undefined },
    });
    assert.ok(
      html.indexOf('data-slot="flow-sheet-back"') <
        html.indexOf('data-slot="dialog-title"'),
      "the way back leads the title row",
    );
    assert.match(html, /aria-label="Back"/);
  });

  it("hangs progress under the title, never over the question", () => {
    const html = compactHeader({
      title: "Give it a name and a color",
      progress: createElement("div", null, "Step 3"),
    });
    assert.ok(
      html.indexOf('data-slot="dialog-title"') <
        html.indexOf('data-slot="flow-sheet-progress"'),
    );
  });

  it("leaves the close X to the dialog, top right", () => {
    // One X per surface: the compact frame keeps DialogContent's own rather
    // than drawing a second one in a header row it does not have.
    assert.doesNotMatch(compactHeader({ title: "Create a team" }), /Close</);
  });
});

describe("FlowSheet renders", () => {
  it("mounts on its props and keeps everything inside the portal", () => {
    // Radix portals mount in an effect, which server rendering never runs.
    const complaints: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) =>
      complaints.push(args.map(String).join(" "));
    let html: string;
    try {
      html = renderToStaticMarkup(
        createElement(FlowSheet, {
          open: true,
          onOpenChange: () => undefined,
          title: "Copy agent",
          size: "compact",
          back: { label: "Back", onClick: () => undefined },
          footer: createElement("div", null, "Next"),
          children: createElement("p", null, "Pick a source agent"),
        }),
      );
    } finally {
      console.error = consoleError;
    }
    assert.deepEqual(complaints, []);
    assert.equal(html, "");
  });
});
