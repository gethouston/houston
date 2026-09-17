import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FlowChoiceList,
  FlowChoiceRow,
} from "../src/components/flow-choice-row.tsx";

Object.assign(globalThis, { React });
const { createElement } = React;

const icon = createElement("svg", { "data-testid": "glyph" });

const row = (props: Partial<Parameters<typeof FlowChoiceRow>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(FlowChoiceRow, {
      icon,
      title: "Start from scratch",
      onClick: () => undefined,
      ...props,
    }),
  );

const classesOf = (html: string): string =>
  /class="([^"]*)"/.exec(html)?.[1] ?? "";

describe("FlowChoiceRow", () => {
  it("is one real button, so the keyboard reaches it like any control", () => {
    const html = row();
    assert.match(html, /^<button /);
    assert.match(html, /type="button"/);
    assert.match(html, />Start from scratch</);
  });

  it("wears the chip's soft fill and no border, hairline or shadow", () => {
    const classes = classesOf(row());
    assert.ok(classes.includes("bg-chip"), classes);
    assert.ok(classes.includes("text-chip-text"), classes);
    assert.ok(!/\bborder\b|\bborder-/.test(classes), classes);
    assert.ok(!classes.includes("ht-hairline"), classes);
    assert.ok(!/\bshadow-/.test(classes), classes);
  });

  it("fills its line and steps the fill up on hover", () => {
    const classes = classesOf(row());
    assert.ok(/\bw-full\b/.test(classes), classes);
    assert.ok(classes.includes("hover:bg-chip-text/15"), classes);
    assert.ok(classes.includes("px-4"), classes);
  });

  it("holds a 44px target with press feedback and a visible focus ring", () => {
    const classes = classesOf(row());
    assert.ok(classes.includes("h-11"), classes);
    assert.ok(classes.includes("active:scale-[0.99]"), classes);
    assert.ok(classes.includes("focus-visible:ring-[3px]"), classes);
    assert.ok(classes.includes("focus-visible:ring-focus/50"), classes);
  });

  it("sets its title in the button's own type, not a size of its own", () => {
    // A door in a list of doors is a control: 14px/500, the type every button
    // in the product is set in.
    const classes = classesOf(row());
    assert.ok(classes.includes("text-sm"), classes);
    assert.ok(classes.includes("font-medium"), classes);
    assert.ok(!classes.includes("text-base"), classes);
  });

  it("hides the decorative glyph from screen readers and sizes it at 20px", () => {
    const html = row();
    assert.match(html, /aria-hidden="true"[^>]*class="[^"]*_svg\]:size-5/);
    assert.match(html, /data-testid="glyph"/);
  });

  it("is a rectangular button: the chip's fill, the input's radius, no chevron", () => {
    const html = row();
    const classes = classesOf(html);
    assert.ok(classes.includes("rounded-lg"), classes);
    assert.ok(classes.includes("bg-chip"), classes);
    assert.ok(!classes.includes("rounded-full"), classes);
    assert.doesNotMatch(html, /lucide-chevron-right/);
    assert.doesNotMatch(html, /class="text-sm text-ink-muted"/);
  });

  it("disables itself without leaving a dead hover target", () => {
    const html = row({ disabled: true });
    assert.match(html, /disabled=""/);
    const classes = classesOf(html);
    assert.ok(classes.includes("disabled:pointer-events-none"), classes);
    assert.ok(classes.includes("disabled:opacity-50"), classes);
  });

  it("passes data hooks through for e2e and the product tour", () => {
    assert.match(
      row({ dataAttrs: { "data-tour": "create-agent" } }),
      /data-tour="create-agent"/,
    );
  });
});

describe("FlowChoiceList", () => {
  it("stacks the buttons in one column with a small gap, no hairlines", () => {
    const html = renderToStaticMarkup(
      createElement(FlowChoiceList, {
        children: createElement("div", null, "a choice"),
      }),
    );
    const classes = classesOf(html);
    assert.ok(classes.includes("gap-2"), classes);
    assert.ok(!classes.includes("divide-y"), classes);
    // One column at every width: a decision laid out in two directions is a
    // menu. No grid, and never `max-md:` — the phone layer is unprefixed.
    assert.ok(!classes.includes("grid"), classes);
    assert.ok(!classes.includes("max-md:"), classes);
  });
});
