import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  sidebarClasses,
  sidebarGlyphDiameter,
  sidebarIconBox,
  sidebarMarkSize,
  sidebarPersonRow,
  sidebarRailInset,
  sidebarRowType,
} from "../src/sidebar-geometry.ts";
import {
  sidebarCollapsedItemClasses,
  sidebarPinnedNeighbour,
  sidebarRowAffordanceClasses,
  sidebarRowButtonClasses,
  sidebarRowFill,
  sidebarRowNeighbour,
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

const ROW_CONSUMERS = ["sidebar-group-header.tsx", "sidebar-item-row.tsx"];

describe("sidebar row anatomy", () => {
  it("draws EVERY rail row through the one row component", () => {
    for (const file of ROW_CONSUMERS) {
      const src = source(file);
      ok(src.includes("<SidebarRowButton"), file);
    }
  });

  it("puts the pinned rows, the list and the account row on ONE left edge", () => {
    ok(includes(sidebarRailInset, "px-2"));
    const rail = source("sidebar.tsx");
    const wrapper = /data-tour-target="agents"[^>]*className="([^"]*)"/.exec(
      rail,
    );
    ok(wrapper, "the list's wrapper");
    strictEqual(/\bp[xl]-[\d.]/.test(wrapper[1]), false, wrapper[1]);
    strictEqual(
      rail.match(/sidebarRailInset/g)?.length,
      3,
      "import, pinned, list",
    );
    ok(source("sidebar-profile-menu.tsx").includes("sidebarRailInset"));
  });

  it("keeps the row geometry OUT of its consumers", () => {
    for (const file of ROW_CONSUMERS) {
      const src = source(file);
      for (const literal of [
        "h-7",
        "pl-5",
        "size-5",
        "size-4",
        "text-[13px]",
        "text-xs",
        "font-weight-510",
      ]) {
        strictEqual(src.includes(`"${literal}`), false, `${file}: ${literal}`);
      }
    }
  });

  it("gives every row the SAME fixed height, in one place", () => {
    ok(includes(sidebarRowButtonClasses.root, "h-7"));
    ok(includes(sidebarRowButtonClasses.button, "h-7"));
    for (const paint of Object.values(sidebarRowState)) {
      strictEqual(includes(paint, "h-7"), false, paint);
      strictEqual(includes(paint, "py-1"), false, paint);
      strictEqual(includes(paint, "py-1.5"), false, paint);
    }
  });

  it("indents CHILD rows one step past the block rows they hang under", () => {
    ok(includes(sidebarRowButtonClasses.depthBlock, "pl-3"));
    ok(includes(sidebarRowButtonClasses.depthChild, "pl-8"));
    ok(includes(sidebarRowButtonClasses.root, "w-full"));
    strictEqual(includes(sidebarRowButtonClasses.root, "pl-2"), false);
    strictEqual(includes(sidebarRowButtonClasses.root, "pl-5"), false);
  });

  it("puts a Lucide mark and an agent avatar in ONE box", () => {
    ok(sidebarRowButtonClasses.icon.startsWith(sidebarIconBox));
    ok(includes(sidebarIconBox, "size-5"));
    ok(includes(sidebarIconBox, "shrink-0"));
    ok(sidebarIconBox.endsWith(sidebarMarkSize.slot));
    ok(includes(sidebarMarkSize.slot, "[&>svg]:size-4"));
    ok(includes(sidebarMarkSize.slot, "[&>img]:size-4"));
    strictEqual(sidebarMarkSize.glyph, "size-3.5");
    strictEqual(sidebarGlyphDiameter, 20);
    strictEqual(/\bm[rlxe]-/.test(sidebarIconBox), false, sidebarIconBox);
  });

  it("runs every row at ONE type size", () => {
    ok(includes(sidebarRowType.item, "text-[13px]"));
    deepStrictEqual(Object.keys(sidebarRowType), ["item"]);
    for (const token of tokens(sidebarRowButtonClasses.button)) {
      strictEqual(/^text-(\[|sm$|xs$|base$)/.test(token), false, token);
    }
  });

  it("gives both type steps a line-height shorter than the row", () => {
    for (const step of Object.values(sidebarRowType)) {
      ok(
        [...tokens(step)].some((t) => t.startsWith("leading-")),
        step,
      );
      strictEqual(includes(step, "leading-none"), false, step);
    }
  });

  it("sets the WHOLE rail at one weight, 510", () => {
    for (const step of Object.values(sidebarRowType)) {
      ok(includes(step, "font-weight-510"), step);
    }
  });

  it("keeps weight OFF the geometry, the paint and the depths", () => {
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
    strictEqual(
      "weightBlock" in sidebarRowButtonClasses,
      false,
      "depth must not carry a weight",
    );
  });

  it("never goes bold anywhere in the rail", () => {
    for (const cls of [
      ...Object.values(sidebarRowType),
      ...Object.values(sidebarRowState),
    ]) {
      strictEqual(includes(cls, "font-medium"), false, cls);
      strictEqual(includes(cls, "font-semibold"), false, cls);
      strictEqual(includes(cls, "font-bold"), false, cls);
    }
    for (const file of ROW_CONSUMERS) {
      const src = source(file);
      for (const literal of ["font-medium", "font-semibold", "font-bold"]) {
        strictEqual(src.includes(literal), false, `${file}: ${literal}`);
      }
    }
  });

  it("never pins a colour on the glyph box", () => {
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
    const cls = sidebarRowAffordanceClasses;
    strictEqual(includes(cls, "opacity-0"), false);
    strictEqual(includes(cls, "hidden"), false);
    strictEqual(includes(cls, "pointer-events-none"), false);
    ok(includes(cls, "hover:text-ink"));
    ok(includes(cls, "focus-visible:text-ink"));
    ok(cls.includes("data-[state=open]:"));
  });

  it("lets the HOST fill an agent row's affordance slot, and owns none itself", () => {
    const row = source("sidebar-item-row.tsx");
    ok(/affordance=\{item\.affordance\}/.test(row), "slot is item-driven");
    strictEqual(row.includes("sidebarRowAffordanceGutter"), false, "no gutter");
    strictEqual(row.includes("DropdownMenu"), false, "host owns the menu");
    ok(
      source("sidebar-props.ts").includes("affordance?: ReactNode"),
      "SidebarItem offers the affordance for a host to fill",
    );
    ok(
      source("sidebar-collapsed-item.tsx").includes("affordance: undefined"),
      "flyout strips the affordance",
    );
    for (const gone of ["onStartRename", "onDeleteItem", "menuContent"]) {
      strictEqual(source("sidebar-row-context.ts").includes(gone), false, gone);
    }
  });

  it("renders block headers with the host's menu affordance", () => {
    ok(source("sidebar-group-header.tsx").includes("affordance={affordance}"));
    strictEqual(source("sidebar-tree-row.tsx").includes("menu="), false);
  });

  it("gives the row a visible focus ring, ON the pill it is outlining", () => {
    ok(includes(sidebarRowButtonClasses.button, "focus-visible:outline-none"));
    strictEqual(
      /focus-visible:ring/.test(sidebarRowButtonClasses.button),
      false,
      "the row's ring belongs to the fill layer, not the button",
    );
    ok(sidebarRowFill.includes("button:first-child:focus-visible"));
    ok(sidebarRowFill.includes("before:ring-2"));
    ok(sidebarRowFill.includes("before:ring-focus"));
    ok(includes(sidebarRowAffordanceClasses, "focus-visible:ring-focus"));
    ok(includes(sidebarRowAffordanceClasses, "focus-visible:outline-none"));
  });

  it("paints an INSET, rounded pill — radius and inset in ONE family", () => {
    ok(sidebarRowFill.includes("before:left-1.5"));
    ok(sidebarRowFill.includes("before:right-1.5"));
    ok(sidebarRowFill.includes("before:rounded-lg"));
    for (const cls of [
      sidebarRowButtonClasses.root.replace(sidebarRowFill, ""),
      sidebarRowButtonClasses.button,
      ...Object.values(sidebarRowState),
    ]) {
      strictEqual(/rounded-/.test(cls), false, cls);
      strictEqual(/-?[lmr][xrl]?-1\.5/.test(cls), false, cls);
    }
    for (const file of ROW_CONSUMERS) {
      strictEqual(/-1\.5\b/.test(source(file)), false, file);
    }
  });

  it("keeps the paint OFF the element that carries the geometry", () => {
    ok(includes(sidebarRowButtonClasses.root, "relative"));
    for (const paint of Object.values(sidebarRowState)) {
      strictEqual(/(^| )bg-/.test(paint), false, paint);
      strictEqual(/(^| )hover:bg-/.test(paint), false, paint);
    }
    ok(includes(sidebarRowButtonClasses.button, "relative"));
    ok(includes(sidebarRowAffordanceClasses, "relative"));
  });

  it("gives the row TWO independent gaps: tight icon, comfortable trailing", () => {
    strictEqual(
      /\bgap-/.test(sidebarRowButtonClasses.button),
      false,
      "a row-level gap would couple the two sides again",
    );
    ok(includes(sidebarRowButtonClasses.icon, "mr-1.5"));
    const px = (token: string) => Number(token.split("-").pop()) * 4;
    const box = px("size-5");
    const gap = px("mr-1.5");
    for (const glyph of [sidebarGlyphDiameter, 16, px(sidebarMarkSize.glyph)]) {
      const edge = gap + (box - glyph) / 2;
      ok(
        edge >= 6 && edge <= 9,
        `glyph ${glyph}px sits ${edge}px off its label`,
      );
      strictEqual(Number.isInteger((box - glyph) / 2), true, `${glyph}px`);
    }
    ok(includes(sidebarRowButtonClasses.trailing, "ml-2"));
    for (const file of ROW_CONSUMERS) {
      strictEqual(/"[^"]*\bgap-\d/.test(source(file)), false, file);
      strictEqual(/"[^"]*\bm[rl]-\d/.test(source(file)), false, file);
    }
  });

  it("stops the row's last thing INSIDE the pill, on one number", () => {
    ok(includes(sidebarRowButtonClasses.button, "pr-2"));
    ok(includes(sidebarRowAffordanceClasses, "mr-2"));
  });

  it("rotates the disclosure mark on a transform-only transition", () => {
    const cls = sidebarRowButtonClasses.caret;
    ok(includes(cls, "transition-transform"));
    ok(includes(cls, "duration-150"));
    ok(includes(cls, "motion-reduce:transition-none"));
  });

  it("draws the disclosure as a FILLED triangle, right after the words", () => {
    const src = source("sidebar-row-button.tsx");
    const mark = source("sidebar-row-caret.tsx");
    strictEqual(mark.includes("lucide-react"), false, "no icon-set chevron");
    ok(mark.includes("<svg"));
    ok(mark.includes('viewBox="0 0 16 16"'));
    ok(mark.includes("<path"));
    ok(includes(sidebarRowButtonClasses.caret, "fill-current"));
    ok(includes(sidebarRowButtonClasses.caret, "size-4"));
    ok(includes(sidebarRowButtonClasses.caret, "text-ink-muted"));
    strictEqual(sidebarRowButtonClasses.caret.includes("/60"), false);
    ok(includes(sidebarRowButtonClasses.caret, "group-hover/row:text-ink"));
    ok(src.includes("c.labelGroup"));
    strictEqual(src.includes('"trailing"'), false, "no trailing caret side");
    strictEqual(source("sidebar-group-header.tsx").includes("caret:"), false);
  });

  it("states the selected row once, and shares it across every row kind", () => {
    ok(includes(sidebarRowState.active, "before:bg-sidebar-active"));
    ok(includes(sidebarRowState.active, "text-ink"));
    ok(includes(sidebarRowState.hover, "hover:before:bg-sidebar-hover"));
    strictEqual(sidebarRowState.hover.includes("/50"), false);
    strictEqual(
      includes(sidebarRowState.hover, "before:bg-sidebar-active"),
      false,
    );
  });

  it("keeps NO inline edit in the rail: identity is edited in ONE dialog", () => {
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
    const src = source("sidebar-tree-row.tsx");
    for (const gap of ["pt-2.5", "first:pt-0", "mt-"])
      strictEqual(src.includes(gap), false, `block spacing: ${gap}`);
    ok(includes(sidebarClasses.itemsList, "space-y-px"));
  });

  it("leaves the COLLAPSED rail its own anatomy", () => {
    ok(includes(sidebarCollapsedItemClasses.trailing, "absolute"));
    ok(includes(sidebarCollapsedItemClasses.trailing, "pointer-events-none"));
    strictEqual("root" in sidebarCollapsedItemClasses, false);
  });
});

describe("sidebar person row", () => {
  const px = (token: string) => Number(token.split("-").pop()) * 4;

  it("seats a 40px portrait on even padding in a fixed 64px row", () => {
    strictEqual(sidebarPersonRow.height, "h-16");
    strictEqual(sidebarRowButtonClasses.personHeight, "h-16");
    ok(includes(sidebarPersonRow.iconBox, "size-10"));
    strictEqual(px("size-10"), sidebarPersonRow.avatarDiameter);
    const padding = (px("h-16") - sidebarPersonRow.avatarDiameter) / 2;
    strictEqual(padding, 12);
    ok(sidebarRowButtonClasses.personIcon.startsWith(sidebarPersonRow.iconBox));
    ok(includes(sidebarRowButtonClasses.personIcon, sidebarPersonRow.iconGap));
  });

  it("keeps the rail's text size: a bolder name over a muted role", () => {
    ok(includes(sidebarPersonRow.name, "text-[13px]"));
    ok(includes(sidebarPersonRow.name, "font-semibold"));
    ok(includes(sidebarPersonRow.role, "text-xs"));
    ok(includes(sidebarPersonRow.role, "text-ink-muted"));
    ok(px("leading-5") + 2 * px("leading-4") < px("h-16"));
    ok(includes(sidebarRowButtonClasses.personName, "truncate"));
    ok(includes(sidebarRowButtonClasses.personRole, "line-clamp-2"));
  });

  it("draws every AI Employee row as a person, laid out like a message list", () => {
    const row = source("sidebar-item-row.tsx");
    ok(row.includes('anatomy="person"'));
    ok(row.includes("subtitle={item.subtitle}"));
    const button = source("sidebar-row-button.tsx");
    ok(button.includes("{(subtitle || trailing) && ("));
    ok(button.includes("person && c.personHeight"));
    ok(includes(sidebarRowButtonClasses.personBadge, "shrink-0"));
  });
});

describe("sidebar person row, message-list details", () => {
  it("gives the name and the line their own weights", () => {
    ok(
      includes(
        sidebarRowButtonClasses.personText,
        "[font-variation-settings:normal]",
      ),
    );
    ok(includes(sidebarPersonRow.name, "font-semibold"));
    ok(includes(sidebarPersonRow.name, "text-ink"));
    ok(includes(sidebarPersonRow.role, "font-normal"));
  });

  it("separates rows with a hairline under the text, never under the pill", () => {
    ok(includes(sidebarRowButtonClasses.personText, "border-b"));
    ok(includes(sidebarRowButtonClasses.personText, "border-line"));
    ok(includes(sidebarRowButtonClasses.personText, "self-stretch"));
    const button = source("sidebar-row-button.tsx");
    ok(button.includes('(active || depth === "child") && c.personTextBare'));
    ok(source("sidebar-profile-menu.tsx").includes("row.personTextBare"));
  });

  it("drops the hairlines around a hovered or selected row, never under a pill", () => {
    ok(
      includes(
        sidebarRowButtonClasses.personText,
        "group-hover/row:border-transparent",
      ),
    );
    ok(source("sidebar-row-button.tsx").includes('data-person-text=""'));
    ok(
      sidebarRowNeighbour.includes(
        "[&:has(+*:hover)_[data-person-text]]:border-transparent",
      ),
    );
    ok(
      sidebarRowNeighbour.includes(
        "[&:has(+*_[aria-current=page])_[data-person-text]]:border-transparent",
      ),
    );
    ok(
      sidebarPinnedNeighbour.includes("[data-sidebar-row]:first-of-type:hover"),
    );
    const tree = source("sidebar-tree-row.tsx");
    ok(
      tree.includes('data-sidebar-row=""') &&
        tree.includes("sidebarRowNeighbour,"),
    );
    const pinned = source("sidebar-pinned-list.tsx");
    ok(
      pinned.includes('data-sidebar-row=""') &&
        pinned.includes("className={sidebarRowNeighbour}"),
    );
    ok(source("sidebar.tsx").includes("sidebarPinnedNeighbour)"));
  });

  it("spans the pill across the row and pads the portrait evenly inside it", () => {
    ok(includes(sidebarRowButtonClasses.personFill, "before:inset-x-0"));
    ok(includes(sidebarPersonRow.padBlock, "pl-3"));
    ok(includes(sidebarPersonRow.padBlock, "pr-3"));
    ok(includes(sidebarPersonRow.padChild, "pl-8"));
    const button = source("sidebar-row-button.tsx");
    ok(button.includes("person && [c.personHeight, c.personFill]"));
  });
});

describe("employee depth", () => {
  it("keeps root employees on the folder header edge and indents only members", () => {
    strictEqual(
      sidebarRowButtonClasses.depthBlock,
      sidebarPersonRow.padBlock.split(" ")[0],
    );
    strictEqual(
      sidebarRowButtonClasses.depthChild,
      sidebarPersonRow.padChild.split(" ")[0],
    );
    ok(includes(sidebarRowButtonClasses.depthBlock, "pl-3"));
    ok(includes(sidebarRowButtonClasses.depthChild, "pl-8"));
    ok(
      source("sidebar-item-row.tsx").includes(
        'depth={grouped ? "child" : "block"}',
      ),
    );
    ok(source("sidebar-tree-row.tsx").includes("grouped={inGroup}"));
  });

  it("holds rows alone: the add shortcut is the host's, drawn by the rail after the list", () => {
    for (const file of ["sidebar-grouped-list.tsx", "sidebar-flat-list.tsx"]) {
      const src = source(file);
      strictEqual(/onAdd|addItem|SidebarAddRow/.test(src), false, file);
    }
    ok(source("sidebar.tsx").includes("{listFooter && ("));
  });
});
