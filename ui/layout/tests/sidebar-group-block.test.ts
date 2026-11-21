import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blockStartKeys, emptyOpenGroupIds } from "../src/sidebar-group-block";
import { SidebarGroupedList } from "../src/sidebar-grouped-list";
import type { SidebarGroupView, SidebarRootEntry } from "../src/sidebar-groups";
import type { SidebarTreeRow } from "../src/sidebar-tree";

Object.assign(globalThis, { React });

describe("emptyOpenGroupIds", () => {
  it("names open groups with no member rows, never folded or filled ones", () => {
    const rows: SidebarTreeRow[] = [
      { kind: "group", id: "Empty", collapsed: false },
      { kind: "agent", id: "a", parentId: null },
      { kind: "group", id: "Folded", collapsed: true },
      { kind: "group", id: "Filled", collapsed: false },
      { kind: "agent", id: "b", parentId: "Filled" },
      { kind: "group", id: "Last", collapsed: false },
    ];
    assert.deepEqual([...emptyOpenGroupIds(rows)], ["Empty", "Last"]);
  });
});

describe("blockStartKeys", () => {
  it("spaces each folder and the root run after one, never root rows in a run", () => {
    const rows: SidebarTreeRow[] = [
      { kind: "agent", id: "first", parentId: null },
      { kind: "group", id: "G", collapsed: false },
      { kind: "agent", id: "m", parentId: "G" },
      { kind: "agent", id: "a", parentId: null },
      { kind: "agent", id: "b", parentId: null },
      { kind: "group", id: "Folded", collapsed: true },
      { kind: "agent", id: "c", parentId: null },
    ];
    assert.deepEqual(
      [...blockStartKeys(rows)],
      ["group:G", "agent:a", "group:Folded", "agent:c"],
    );
  });

  it("never spaces the first row", () => {
    const rows: SidebarTreeRow[] = [
      { kind: "group", id: "G", collapsed: true },
    ];
    assert.equal(blockStartKeys(rows).size, 0);
  });
});

const items = ["a", "b", "c"].map((id) => ({ id, name: id }));
const order: SidebarRootEntry[] = [
  { kind: "group", id: "Logistics" },
  { kind: "agent", id: "a" },
  { kind: "agent", id: "b" },
  { kind: "agent", id: "c" },
];
const rail = (groups: SidebarGroupView[], arrangeable = true) =>
  renderToStaticMarkup(
    React.createElement(SidebarGroupedList, {
      items,
      groups,
      order,
      rowCtx: { selectedId: null, onSelect: () => undefined },
      onArrange: arrangeable ? () => true : undefined,
      labels: { emptyGroup: "Drag an AI Employee here" },
    }),
  );
const logistics = (collapsed: boolean, itemIds: string[] = []) => [
  { id: "Logistics", name: "Logistics", collapsed, itemIds },
];
const hint = /data-sidebar-empty-group="Logistics"/;

describe("SidebarGroupedList empty group", () => {
  it("draws the hint under the open empty group, before the top-level rows", () => {
    const markup = rail(logistics(false));
    assert.match(markup, hint);
    assert.match(markup, /Drag an AI Employee here/);
    assert.ok(
      markup.indexOf("data-sidebar-group-block") <
        markup.indexOf('data-item-id="a"'),
    );
  });

  it("folding the empty group hides the hint, so the toggle shows", () => {
    assert.doesNotMatch(rail(logistics(true)), hint);
  });

  it("draws no hint once the group has a member", () => {
    assert.doesNotMatch(rail(logistics(false, ["a"])), hint);
  });

  it("draws no drag hint where nothing can be dragged", () => {
    assert.doesNotMatch(rail(logistics(false), false), hint);
  });
});

describe("SidebarGroupedList folder edges", () => {
  const rows = (markup: string) =>
    [...markup.matchAll(/<div[^>]*data-sidebar-row=""[^>]*>/g)].map(
      (m) => m[0],
    );
  const markup = rail(logistics(false, ["a"]));
  const row = (id: string) => {
    const found = rows(markup).find((tag) =>
      tag.includes(`data-item-id="${id}"`),
    );
    assert.ok(found, id);
    return found;
  };

  const hairline = (id: string) => {
    const tag = row(id);
    const start = markup.indexOf(tag);
    const end = markup.indexOf('data-sidebar-row=""', start + tag.length);
    const chunk = markup.slice(start, end === -1 ? undefined : end);
    const text = chunk.match(/<span data-person-text=""[^>]*>/)?.[0];
    assert.ok(text, id);
    return text;
  };

  it("draws no line inside a folder, down or between its members", () => {
    assert.doesNotMatch(row("a"), /after:bg-line/);
    assert.doesNotMatch(hairline("a"), /border-line/);
    assert.match(hairline("b"), /border-line/);
  });

  it("spaces the first root employee after the folder, not the next one", () => {
    assert.match(row("b"), /\bmt-3\b/);
    assert.doesNotMatch(row("c"), /\bmt-3\b/);
  });
});
