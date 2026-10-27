// SSR render of the archived list row. The promise it guards: a mission's tag
// ("Routine", "Started by Houston") reads the same in the archive as on the
// board card, in the card's own chip, and a mission without one stays a
// plain row.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { TooltipProvider } from "@houston-ai/core";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KanbanCard } from "../src/kanban-card.tsx";
import { KanbanListItem } from "../src/kanban-list-item.tsx";
import type { KanbanItem } from "../src/types.ts";

Object.assign(globalThis, { React });
const { createElement } = React;

const mission = (tags?: string[]): KanbanItem => ({
  id: "m1",
  title: "Draft the launch email",
  status: "archived",
  lastMessageAt: "2026-09-28T10:00:00.000Z",
  tags,
});

const row = (item: KanbanItem): string =>
  renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(KanbanListItem, { item, onSelect: () => undefined }),
    ),
  );

const card = (item: KanbanItem): string =>
  renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(KanbanCard, { item, onSelect: () => undefined }),
    ),
  );

/** The outer element of the pill wrapping `label`, as rendered. */
const chipAround = (html: string, label: string): string | undefined =>
  html.match(
    new RegExp(`<span class="([^"]*)"><span class="truncate">${label}<`),
  )?.[1];

describe("KanbanListItem tags", () => {
  it("wears the mission's tag after its title", () => {
    const html = row(mission(["Started by Houston"]));
    assert.ok(html.includes("Started by Houston"));
    assert.ok(
      html.indexOf("Draft the launch email") <
        html.indexOf("Started by Houston"),
    );
  });

  it("uses the board card's exact chip", () => {
    const tagged = mission(["Routine"]);
    const rowChip = chipAround(row(tagged), "Routine");
    assert.ok(rowChip, "the row renders no tag chip");
    assert.equal(rowChip, chipAround(card(tagged), "Routine"));
  });

  it("truncates a long tag instead of widening the row", () => {
    const html = row(mission(["Started by Marisol Fernández-Oyarzábal"]));
    assert.match(html, /max-w-\[40%\]/);
    assert.ok(chipAround(html, "Started by Marisol Fernández-Oyarzábal"));
  });

  it("renders no pill for a mission the user started", () => {
    assert.equal(row(mission()).includes("bg-chip"), false);
    assert.equal(row(mission([])).includes("bg-chip"), false);
  });
});
