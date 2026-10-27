import assert from "node:assert/strict";
import { it } from "node:test";
import { TooltipProvider } from "@houston-ai/core";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KanbanBoard } from "../src/kanban-board.tsx";
import { KanbanCard } from "../src/kanban-card.tsx";
import { KanbanDetailPanel } from "../src/kanban-detail-panel.tsx";
import { KanbanList } from "../src/kanban-list.tsx";
import { KanbanListItem } from "../src/kanban-list-item.tsx";
import type { KanbanItem } from "../src/types.ts";

Object.assign(globalThis, { React });
const item: KanbanItem = {
  id: "m1",
  title: "Draft",
  group: "Legal assistant",
  status: "done",
  lastMessageAt: "2026-10-27T15:48:00.000Z",
};
const formatTime = () => ({
  short: "15:48",
  full: "martes, 27 de octubre de 2026, 15:48",
});
const render = (child: React.ReactNode) =>
  renderToStaticMarkup(React.createElement(TooltipProvider, null, child));

it("cards and rows show a semantic time with the supplied localized label", () => {
  for (const Component of [KanbanCard, KanbanListItem]) {
    const html = render(
      React.createElement(Component, { item, formatTime, onSelect() {} }),
    );
    assert.match(html, /<time[^>]*dateTime="2026-10-27T15:48:00.000Z"/);
    assert.doesNotMatch(html, /<time[^>]*title=/);
    assert.match(html, />15:48<\/time>/);
    assert.ok(html.indexOf("Legal assistant") < html.indexOf(">15:48</time>"));
  }
});

it("a card without an agent name still shows its time", () => {
  const html = render(
    React.createElement(KanbanCard, {
      item: { ...item, group: undefined },
      formatTime,
      onSelect() {},
    }),
  );
  assert.match(html, />15:48<\/time>/);
  assert.equal(html.includes("·"), false);
});

it("the detail panel shows the translated last-message label and full time", () => {
  const html = render(
    React.createElement(
      KanbanDetailPanel,
      {
        title: "Draft",
        lastMessageAt: item.lastMessageAt,
        formatTime,
        lastMessageLabel: (time) => `Último mensaje: ${time}`,
      },
      null,
    ),
  );
  assert.ok(
    html.includes("Último mensaje: martes, 27 de octubre de 2026, 15:48"),
  );
});

it("board columns and list rows sort by last message, newest first", () => {
  const items = [
    item,
    {
      ...item,
      id: "m2",
      title: "Newest",
      lastMessageAt: "2026-10-28T15:48:00.000Z",
    },
  ];
  const list = render(
    React.createElement(KanbanList, { items, formatTime, onSelect() {} }),
  );
  const board = render(
    React.createElement(KanbanBoard, {
      items,
      columns: [{ id: "done", label: "Done", statuses: ["done"] }],
      formatTime,
    }),
  );
  for (const html of [list, board])
    assert.ok(html.indexOf("Newest") < html.indexOf("Draft"));
});

it("detail headers use the medium date and short time", () => {
  const html = render(
    React.createElement(
      KanbanDetailPanel,
      { title: "Draft", lastMessageAt: item.lastMessageAt },
      null,
    ),
  );
  const expected = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(item.lastMessageAt));
  assert.ok(html.includes(`Last message: ${expected}`));
});
