import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatInteractionOption } from "../src/interaction-card-logic.ts";
import { OptionRow } from "../src/interaction-card-parts.tsx";

Object.assign(globalThis, { React });

const radio = (option: ChatInteractionOption): HTMLElement => {
  const html = renderToStaticMarkup(
    React.createElement(OptionRow, {
      disabled: false,
      onSelect: () => undefined,
      option,
      position: 1,
      recommendedLabel: "Recommended",
      selected: false,
    }),
  );
  const el = new JSDOM(html).window.document.querySelector('[role="radio"]');
  assert.ok(el, "no radio row");
  return el as HTMLElement;
};

describe("question option description", () => {
  it("shows under the label when the option has one", () => {
    const row = radio({
      id: "trigger",
      label: "When something happens in an app",
      description: "A connected app like Gmail starts it.",
    });
    assert.match(row.textContent ?? "", /When something happens in an app/);
    assert.match(
      row.textContent ?? "",
      /A connected app like Gmail starts it\./,
    );
  });

  it("adds nothing when the option has none", () => {
    const plain = radio({ id: "a", label: "Personal" });
    assert.equal(plain.textContent, "Personal1");
  });

  it("keeps the Recommended chip beside the label", () => {
    const row = radio({
      id: "a",
      label: "Personal",
      description: "Your own inbox",
      recommended: true,
    });
    assert.match(row.textContent ?? "", /PersonalRecommendedYour own inbox/);
  });
});
