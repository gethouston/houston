import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  instructionsTriggerLabel,
  SkillInstructionsDisclosure,
} from "../src/skill-instructions-disclosure.tsx";

// The core primitives compile to the classic JSX runtime under this runner.
Object.assign(globalThis, { React });

const render = (
  props: Omit<
    Partial<Parameters<typeof SkillInstructionsDisclosure>[0]>,
    "children"
  > = {},
) =>
  renderToStaticMarkup(
    React.createElement(
      SkillInstructionsDisclosure,
      props as Parameters<typeof SkillInstructionsDisclosure>[0],
      React.createElement("pre", null, "Always greet by first name."),
    ),
  );

describe("the instructions trigger's two faces", () => {
  it("offers to show while collapsed and to hide while open", () => {
    assert.equal(instructionsTriggerLabel(false), "Show instructions");
    assert.equal(instructionsTriggerLabel(true), "Hide instructions");
  });

  it("takes the caller's localized labels for both", () => {
    // ui/ is i18n-agnostic: the app passes t() results in as flat strings.
    const labels = { show: "Ver instrucciones", hide: "Ocultar instrucciones" };
    assert.equal(instructionsTriggerLabel(false, labels), labels.show);
    assert.equal(instructionsTriggerLabel(true, labels), labels.hide);
  });

  it("falls back per label, so half a translation is still usable", () => {
    assert.equal(
      instructionsTriggerLabel(false, { hide: "Ocultar instrucciones" }),
      "Show instructions",
    );
    assert.equal(
      instructionsTriggerLabel(true, { show: "Ver instrucciones" }),
      "Hide instructions",
    );
  });
});

describe("SkillInstructionsDisclosure", () => {
  it("opens collapsed, so a skill surface keeps its familiar size", () => {
    const html = render();
    assert.match(html, />Show instructions</);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(
      html,
      /Always greet by first name/,
      "a collapsed disclosure must not lay out the whole SKILL.md body",
    );
  });

  it("is a real button that never submits a form around it", () => {
    assert.match(render(), /<button[^>]*type="button"/);
  });

  it("is visible at rest — never a hover-gated affordance", () => {
    // DESIGN.md §3.7: an action a mouse has to find is one a keyboard and a
    // touch screen never find at all.
    const html = render();
    assert.doesNotMatch(html, /opacity-0/);
    assert.doesNotMatch(html, /group-hover/);
  });

  it("carries the caller's label into the markup", () => {
    assert.match(render({ labels: { show: "Ver instrucciones" } }), />Ver /);
  });

  it("takes a className for the surface it sits in", () => {
    assert.match(render({ className: "mt-6" }), /class="[^"]*mt-6/);
  });
});
