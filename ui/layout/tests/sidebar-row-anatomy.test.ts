import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  sidebarBandInset,
  sidebarClasses,
  sidebarIconBox,
  sidebarRowType,
} from "../src/sidebar-geometry.ts";
import {
  sidebarCollapsedItemClasses,
  sidebarRowAffordanceClasses,
  sidebarRowButtonClasses,
  sidebarRowFill,
  sidebarRowState,
} from "../src/sidebar-paint.ts";

function tokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function includes(className: string, token: string): boolean {
  return tokens(className).has(token);
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function source(file: string): string {
  return readFileSync(join(SRC, file), "utf8");
}

/**
 * Every module that draws an interactive line in the rail. The anatomy is only
 * defined once if all of them go THROUGH the one row component rather than
 * reproducing its geometry, so this list is the contract and the assertion
 * below is what keeps a new row kind from quietly forking it.
 */
const ROW_CONSUMERS = [
  "sidebar-nav.tsx", // the top-level destinations
  "sidebar-band.tsx", // the ONE band: "My accounts", "Workspace", "Your teams"
  "sidebar-group-header.tsx", // a team block's header
  "sidebar-item-row.tsx", // an agent row
  "sidebar-add-row.tsx", // the "New agent" row that closes the list
];

/**
 * The rail modules that render rows but must NEVER compose a band themselves:
 * the band is `sidebar-band.tsx`'s alone.
 */
const BAND_PROP = /^\s*band\s*$/m;

const BAND_FREE = [
  "sidebar-nav.tsx",
  "sidebar-group-header.tsx",
  "sidebar-item-row.tsx",
  "sidebar-add-row.tsx",
];

describe("sidebar row anatomy", () => {
  it("draws EVERY rail row through the one row component", () => {
    // The whole design: a nav destination, the band, a team header, an agent
    // and the add row are one object wearing different options. A module that
    // hand-rolls a row is how the rail went back to reading as several stacked
    // lists.
    for (const file of ROW_CONSUMERS) {
      const src = source(file);
      ok(src.includes("<SidebarRowButton"), file);
    }
  });

  it("draws EVERY band through the ONE band component", () => {
    // The rail names three runs — "My accounts", "Workspace" and "Your teams" —
    // and all three are `SidebarBand`. Nothing else may compose a band: a
    // second one would drift in its type step, its triangle placement, its
    // fold or the gap under it, and the rail would read as three lists that
    // merely resemble each other. `sidebar-rail-chrome.tsx` renders the two nav
    // runs, `sidebar.tsx` the teams list.
    for (const file of ["sidebar-rail-chrome.tsx", "sidebar.tsx"]) {
      ok(source(file).includes("<SidebarBand"), file);
    }
    // And no band is hand-rolled: only the section component itself may put a
    // row into the `band` type step, which is the bare `band` prop.
    for (const file of BAND_FREE) {
      strictEqual(BAND_PROP.test(source(file)), false, file);
    }
    ok(BAND_PROP.test(source("sidebar-band.tsx")));
  });

  it("lets the band component own the fold and its aria wiring", () => {
    // `aria-controls` has to resolve, so the content region is minted and kept
    // by the component rather than by each caller. A caller passing its own id
    // is how two bands ended up controlling the same region.
    const src = source("sidebar-band.tsx");
    ok(src.includes("useId()"));
    ok(src.includes("expanded: !collapsed"));
    // Folded drops the ROWS, never the region they live in.
    ok(src.includes("collapsed ? null : children"));
  });

  it("puts all THREE bands on ONE left edge", () => {
    // "My accounts" and "Workspace" hung 8px right of "Your teams": the `<nav>`
    // holding them was padded AND `SidebarBand` padded its own heading, so
    // those two bands were inset twice while the teams band — rendered from
    // `sidebar.tsx` inside an unpadded wrapper — was inset once. Every band's
    // child ROWS sat at 8px either way, so only the labels drifted, and the
    // rail read as two lists that happen to be stacked. The inset is one export
    // now, spent once per heading and once per run of rows.
    ok(includes(sidebarBandInset, "px-2"));

    // The band component insets its heading with that value and nothing else:
    // it is the ONLY thing in the rail that insets a band heading.
    const band = source("sidebar-band.tsx");
    ok(band.includes("sidebarBandInset"));
    strictEqual(
      /\bp[xl]-[\d.]/.test(band),
      false,
      "the band heading must carry no horizontal pad of its own",
    );

    // Neither renderer wraps its band in an element that pads horizontally.
    // In the nav chrome the only horizontal pad left belongs to the COLLAPSED
    // icon rail, which renders no bands at all.
    const chrome = source("sidebar-rail-chrome.tsx");
    const navOpen = chrome.indexOf("<nav");
    const nav = chrome.slice(navOpen, chrome.indexOf(">", navOpen) + 1);
    for (const line of nav.split("\n")) {
      if (/\bp[xl]-[\d.]/.test(line)) ok(line.includes("collapsed"), line);
    }
    ok(chrome.includes("sidebarBandInset"), "the nav rows share the inset");

    // And the teams band's wrapper in `sidebar.tsx` pads nothing.
    const rail = source("sidebar.tsx");
    const wrapper = /data-tour-target="agents"[^>]*className="([^"]*)"/.exec(
      rail,
    );
    ok(wrapper, "the teams band's wrapper");
    strictEqual(/\bp[xl]-[\d.]/.test(wrapper[1]), false, wrapper[1]);
    ok(rail.includes("sidebarBandInset"), "the teams list shares the inset");
  });

  it("keeps the row geometry OUT of its consumers", () => {
    // No consumer may restate the height, the indent, the glyph box or the
    // type: those are the values that drift, and they only exist in one module.
    for (const file of ROW_CONSUMERS) {
      const src = source(file);
      for (const literal of [
        "h-7",
        "pl-5",
        "size-5",
        "text-[13px]",
        "text-xs",
        "font-weight-510",
      ]) {
        strictEqual(src.includes(`"${literal}`), false, `${file}: ${literal}`);
      }
    }
  });

  it("gives every row the SAME fixed height, in one place", () => {
    // A rail that reflows under the cursor is the most obvious tell of a
    // hand-built list, so height is pinned and no state may change it.
    ok(includes(sidebarRowButtonClasses.root, "h-7"));
    ok(includes(sidebarRowButtonClasses.button, "h-7"));
    for (const paint of Object.values(sidebarRowState)) {
      strictEqual(includes(paint, "h-7"), false, paint);
      strictEqual(includes(paint, "py-1"), false, paint);
      strictEqual(includes(paint, "py-1.5"), false, paint);
    }
  });

  it("indents CHILD rows one step past the block rows they hang under", () => {
    // Two indents and only two: a block head sits at the rail's edge, and
    // everything it contains shares one glyph column 12px to its right.
    ok(includes(sidebarRowButtonClasses.depthBlock, "pl-2"));
    ok(includes(sidebarRowButtonClasses.depthChild, "pl-5"));
    // The pill spans the row either way — hierarchy is inside it, never a
    // ragged left edge.
    ok(includes(sidebarRowButtonClasses.root, "w-full"));
    strictEqual(includes(sidebarRowButtonClasses.root, "pl-2"), false);
    strictEqual(includes(sidebarRowButtonClasses.root, "pl-5"), false);
  });

  it("puts a Lucide mark and an agent avatar in ONE box", () => {
    ok(sidebarRowButtonClasses.icon.startsWith(sidebarIconBox));
    ok(includes(sidebarIconBox, "size-5"));
    ok(includes(sidebarIconBox, "shrink-0"));
    // The box itself carries no gap: the gap is the ROW's, spent beside it, so
    // a consumer mounting the box elsewhere does not inherit rail spacing.
    strictEqual(/\bm[rlxe]-/.test(sidebarIconBox), false, sidebarIconBox);
  });

  it("runs on TWO type sizes and no more: 13px rows, a 12px band", () => {
    // Every row that points at something is one size, so the rail reads as one
    // list; the band that merely names the list is one step down. A third size
    // anywhere is how a rail starts looking like a settings form.
    ok(includes(sidebarRowType.item, "text-[13px]"));
    ok(includes(sidebarRowType.band, "text-xs"));
    // The size lives on the type ramp, never on the geometry class, or the two
    // would have to be kept in step by hand.
    for (const token of tokens(sidebarRowButtonClasses.button)) {
      strictEqual(/^text-(\[|sm$|xs$|base$)/.test(token), false, token);
    }
  });

  it("paints the band one step OFF muted, toward the ink", () => {
    // "Your teams" in `ink-muted` read as disabled next to the rows under it.
    // It takes the same resting label colour as every other row (one step
    // toward the ink) and is set apart by SIZE, which is the quiet way.
    ok(includes(sidebarRowState.restText, "text-hover-text"));
    strictEqual(
      source("sidebar-band.tsx").includes("muted"),
      false,
      "the band must not be muted",
    );
    ok(source("sidebar-band.tsx").includes("band"));
  });

  it("gives both type steps a line-height shorter than the row", () => {
    // 28px box, flex-centred: an explicit leading keeps the label optically
    // centred, and one taller than the box would push it off-centre while a
    // `leading-none` clips descenders against the label's truncation overflow.
    for (const step of Object.values(sidebarRowType)) {
      ok(
        [...tokens(step)].some((t) => t.startsWith("leading-")),
        step,
      );
      strictEqual(includes(step, "leading-none"), false, step);
    }
  });

  it("sets the WHOLE rail at one weight, 510", () => {
    // Linear's rails sit at 510, the notch past medium, and every line of ours
    // wears it: rows, team headers and the band alike. One weight means weight
    // can never track depth OR state, so a click cannot re-measure a label and
    // move the truncation point of a long agent name.
    for (const step of Object.values(sidebarRowType)) {
      ok(includes(step, "font-weight-510"), step);
    }
  });

  it("keeps weight OFF the geometry, the paint and the depths", () => {
    // Weight belongs to the type ramp and nowhere else. A second class that
    // also spoke about weight is exactly how the band drifted away from the
    // rows it heads.
    for (const cls of [
      sidebarRowButtonClasses.depthBlock,
      sidebarRowButtonClasses.depthChild,
      sidebarRowButtonClasses.button,
      sidebarRowButtonClasses.root,
      ...Object.values(sidebarRowState),
    ]) {
      for (const token of tokens(cls)) {
        strictEqual(
          /^font-(weight-|medium$|semibold$|bold$)/.test(token),
          false,
          token,
        );
      }
    }
    // The depth prop carries the indent and NOTHING else now that weight is
    // uniform — no consumer may reintroduce a per-depth weight.
    strictEqual(
      "weightBlock" in sidebarRowButtonClasses,
      false,
      "depth must not carry a weight",
    );
  });

  it("never goes bold anywhere in the rail", () => {
    // "Your teams" reading as semibold grey was the tell that the rail had been
    // built as a heading with a list under it.
    for (const cls of [
      ...Object.values(sidebarRowType),
      ...Object.values(sidebarRowState),
    ]) {
      strictEqual(includes(cls, "font-medium"), false, cls);
      strictEqual(includes(cls, "font-semibold"), false, cls);
      strictEqual(includes(cls, "font-bold"), false, cls);
    }
    // And no consumer may hand-roll one back onto a row.
    for (const file of ROW_CONSUMERS) {
      const src = source(file);
      for (const literal of ["font-medium", "font-semibold", "font-bold"]) {
        strictEqual(src.includes(literal), false, `${file}: ${literal}`);
      }
    }
  });

  it("never pins a colour on the glyph box", () => {
    // A selected row's glyph must brighten WITH its label, as one object.
    for (const token of tokens(sidebarIconBox)) {
      strictEqual(token.startsWith("text-"), false, token);
    }
  });

  it("constrains long names before trailing controls", () => {
    ok(includes(sidebarRowButtonClasses.root, "min-w-0"));
    ok(includes(sidebarRowButtonClasses.button, "min-w-0"));
    ok(includes(sidebarRowButtonClasses.button, "flex-1"));
    ok(includes(sidebarRowButtonClasses.label, "truncate"));
    ok(includes(sidebarRowButtonClasses.label, "min-w-0"));
    ok(includes(sidebarRowButtonClasses.trailing, "shrink-0"));
    ok(includes(sidebarRowAffordanceClasses, "shrink-0"));
    ok(includes(sidebarClasses.itemsList, "w-0"));
    ok(includes(sidebarClasses.itemsList, "min-w-full"));
  });

  it("keeps every affordance visible, quiet, and never hover-GATED", () => {
    // Houston's rule: hover may enhance, never gate. A "..." that only exists
    // under the cursor is unreachable by touch and invisible to a scan. ONE
    // class now, so the team menu, the agent menu and the band's "+" cannot
    // diverge — they are literally the same string.
    const cls = sidebarRowAffordanceClasses;
    strictEqual(includes(cls, "opacity-0"), false);
    strictEqual(includes(cls, "hidden"), false);
    strictEqual(includes(cls, "pointer-events-none"), false);
    ok(includes(cls, "hover:text-ink"));
    ok(includes(cls, "focus-visible:text-ink"));
    ok(cls.includes("data-[state=open]:"));
  });

  it("gives an AGENT row NO control beside its button", () => {
    // An agent is renamed, recoloured, moved and deleted on its focused agent
    // screen. The row neither renders a control for any of that nor reserves a
    // column for one, so the agent's name gets the rail's full width.
    const row = source("sidebar-item-row.tsx");
    strictEqual(/affordance=/.test(row), false, "no affordance slot");
    strictEqual(row.includes("sidebarRowAffordanceGutter"), false, "no gutter");
    strictEqual(row.includes("DropdownMenu"), false, "host owns the menu");
    strictEqual(
      source("sidebar-props.ts").includes("affordance"),
      false,
      "SidebarItem has no affordance for a host to fill",
    );
    for (const gone of ["onStartRename", "onDeleteItem", "menuContent"]) {
      strictEqual(source("sidebar-row-context.ts").includes(gone), false, gone);
    }
  });

  it("renders block headers without a menu affordance column", () => {
    strictEqual(
      source("sidebar-group-header.tsx").includes("affordance="),
      false,
    );
    strictEqual(source("sidebar-block-header.tsx").includes("menu="), false);
  });

  it("gives the row a visible focus ring, ON the pill it is outlining", () => {
    // The ring rides the SAME inset layer as the fill, scoped to the row's own
    // button. Left on the full-width button it drew a rectangle 12px wider than
    // the pill it was meant to be tracing.
    ok(includes(sidebarRowButtonClasses.button, "focus-visible:outline-none"));
    strictEqual(
      /focus-visible:ring/.test(sidebarRowButtonClasses.button),
      false,
      "the row's ring belongs to the fill layer, not the button",
    );
    ok(sidebarRowFill.includes("button:first-child:focus-visible"));
    ok(sidebarRowFill.includes("before:ring-2"));
    ok(sidebarRowFill.includes("before:ring-focus"));
    // The affordance is a separate control and keeps its own ring.
    ok(includes(sidebarRowAffordanceClasses, "focus-visible:ring-focus"));
    ok(includes(sidebarRowAffordanceClasses, "focus-visible:outline-none"));
  });

  it("paints an INSET, rounded pill — radius and inset in ONE family", () => {
    // A fill spanning the rail edge to edge is a bar: at 28px tall an 8px
    // corner is invisible and the rail reads as stacked rectangles. Pulling the
    // paint 6px in from each side is what makes the corner legible, on the same
    // `rounded-lg` the team screen's section lozenges wear.
    ok(sidebarRowFill.includes("before:left-1.5"));
    ok(sidebarRowFill.includes("before:right-1.5"));
    ok(sidebarRowFill.includes("before:rounded-lg"));
    // And nothing else in the rail restates either value, so the pill cannot
    // drift per row kind.
    for (const cls of [
      sidebarRowButtonClasses.root.replace(sidebarRowFill, ""),
      sidebarRowButtonClasses.button,
      ...Object.values(sidebarRowState),
    ]) {
      strictEqual(/rounded-/.test(cls), false, cls);
      strictEqual(/-?[lmr][xrl]?-1\.5/.test(cls), false, cls);
    }
    // No consumer restates the INSET either. (Radius is NOT checked per file:
    // the collapsed icon rail lives in `sidebar-nav.tsx` too and rounds its own
    // 36px glyph, which is a different object — see the last test here.)
    for (const file of ROW_CONSUMERS) {
      strictEqual(/-1\.5\b/.test(source(file)), false, file);
    }
  });

  it("keeps the paint OFF the element that carries the geometry", () => {
    // Invariant 2. Inset the row itself and the glyph column moves 6px with it;
    // a pseudo-element paints, spans nothing and pushes nothing.
    ok(includes(sidebarRowButtonClasses.root, "relative"));
    for (const paint of Object.values(sidebarRowState)) {
      strictEqual(/(^| )bg-/.test(paint), false, paint);
      strictEqual(/(^| )hover:bg-/.test(paint), false, paint);
    }
    // The button and the affordance are positioned ONLY so they paint above the
    // pill; a static sibling would sit underneath it.
    ok(includes(sidebarRowButtonClasses.button, "relative"));
    ok(includes(sidebarRowAffordanceClasses, "relative"));
  });

  it("gives the row TWO independent gaps: tight icon, comfortable trailing", () => {
    // One `gap` on the row set both at once, so tightening the icon side
    // dragged the trailing side in with it and the badge and the "..." ended up
    // crowding the row's right edge. They are separate margins now.
    strictEqual(
      /\bgap-/.test(sidebarRowButtonClasses.button),
      false,
      "a row-level gap would couple the two sides again",
    );
    // Glyph EDGE to first letter is this margin plus the slack the mark leaves
    // in the 20px box (0 for an avatar, 2px for a 16px Lucide mark, 3px for a
    // 14px team mark): 6px lands it at 6-9px, Linear's range.
    ok(includes(sidebarRowButtonClasses.icon, "mr-1.5"));
    // A badge is a separate object from the name, not part of the phrase, so it
    // gets more air than the icon does — strictly more.
    ok(includes(sidebarRowButtonClasses.trailing, "ml-2"));
    // One family, so every row kind moves together.
    for (const file of ROW_CONSUMERS) {
      strictEqual(/"[^"]*\bgap-\d/.test(source(file)), false, file);
      strictEqual(/"[^"]*\bm[rl]-\d/.test(source(file)), false, file);
    }
  });

  it("stops the row's last thing INSIDE the pill, on one number", () => {
    // The pill insets its paint 6px. At 4px the trailing badge and the "..."
    // both overhung it, which is what made the "..." look jammed against the
    // rail's edge. 8px on both — the button pads, the affordance (a SIBLING)
    // margins — puts them 2px inside it.
    ok(includes(sidebarRowButtonClasses.button, "pr-2"));
    ok(includes(sidebarRowAffordanceClasses, "mr-2"));
  });

  it("rotates the disclosure mark on a transform-only transition", () => {
    // DESIGN.md allows transform + opacity per frame and nothing else.
    const cls = sidebarRowButtonClasses.caret;
    ok(includes(cls, "transition-transform"));
    ok(includes(cls, "duration-150"));
    ok(includes(cls, "motion-reduce:transition-none"));
  });

  it("draws the disclosure as a FILLED triangle, right after the words", () => {
    // A filled triangle says "this is closed"; an outline chevron says "there
    // is more over there". Local SVG, because no icon set ships this shape at
    // this weight and a dependency for one path would be absurd.
    const src = source("sidebar-row-button.tsx");
    strictEqual(src.includes("lucide-react"), false, "no icon-set chevron");
    ok(src.includes("<svg"));
    ok(src.includes('viewBox="0 0 16 16"'));
    ok(src.includes("<path"));
    ok(includes(sidebarRowButtonClasses.caret, "fill-current"));
    // Linear's own 16px box. At 12px the same 5x7 mark was a speck.
    ok(includes(sidebarRowButtonClasses.caret, "size-4"));
    // One step short of the label's own `hover-text`, and a full step past the
    // `ink-muted/60` wash it used to wear: visible at rest without competing
    // with the words. Hover takes it the rest of the way to ink.
    ok(includes(sidebarRowButtonClasses.caret, "text-ink-muted"));
    strictEqual(sidebarRowButtonClasses.caret.includes("/60"), false);
    ok(includes(sidebarRowButtonClasses.caret, "group-hover/row:text-ink"));
    // Immediately after the label, inside the phrase it belongs to — never
    // pinned to the row's right edge, and never a second placement option.
    ok(src.includes("c.labelGroup"));
    strictEqual(src.includes('"trailing"'), false, "no trailing caret side");
    for (const file of ["sidebar-band.tsx", "sidebar-group-header.tsx"]) {
      strictEqual(source(file).includes("caret:"), false, file);
    }
  });

  it("states the selected row once, and shares it across every row kind", () => {
    // Both fills are spent on the pill layer, never on the row itself.
    ok(includes(sidebarRowState.active, "before:bg-sidebar-active"));
    ok(includes(sidebarRowState.active, "text-ink"));
    // The hover wash is its OWN token at 6%, against the pill's 10%: visible
    // on both canvases, never mistakable for the selected row. The old
    // `bg-hover/50` resolved to ~3-4% and was invisible in practice.
    ok(includes(sidebarRowState.hover, "hover:before:bg-sidebar-hover"));
    strictEqual(sidebarRowState.hover.includes("/50"), false);
    strictEqual(
      includes(sidebarRowState.hover, "before:bg-sidebar-active"),
      false,
    );
  });

  it("keeps NO inline edit in the rail: identity is edited in ONE dialog", () => {
    // A block's name, mark and colour are one identity, changed together in
    // the host's "change icon & name" dialog (the menu's one entry). An inline
    // rename beside that dialog would be the same question answered two ways,
    // so no rail row swaps into a text field.
    strictEqual(
      source("sidebar-group-header.tsx").includes("<input"),
      false,
      "a block header is not renamed from the rail",
    );
    strictEqual(
      source("sidebar-item-row.tsx").includes("input"),
      false,
      "an agent row is not renamed from the rail",
    );
  });

  it("stacks teams on the list's OWN rhythm, with no gap between blocks", () => {
    // One rhythm from the band to the last row: a block adds no vertical space
    // of its own, so two teams sit exactly as far apart as two agents do. The
    // 10px it used to insert read as a hole in the rail — Linear's does not.
    const src = source("sidebar-group-section.tsx");
    for (const gap of ["pt-2.5", "first:pt-0", "mt-"])
      strictEqual(src.includes(gap), false, `block spacing: ${gap}`);
    ok(includes(sidebarClasses.itemsList, "space-y-px"));
  });

  it("leaves the COLLAPSED rail its own anatomy", () => {
    // A 36px glyph with a corner badge and a flyout is a different object, not
    // a narrower row, which is why the primitive does not try to be it — and
    // why the inset pill and the 6px row gap do not reach it: it has no label
    // to sit beside and no width to be inset from.
    ok(includes(sidebarCollapsedItemClasses.trailing, "absolute"));
    ok(includes(sidebarCollapsedItemClasses.trailing, "pointer-events-none"));
    strictEqual("root" in sidebarCollapsedItemClasses, false);
  });
});
