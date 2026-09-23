// SSR render of ChatInteractionCard, kept apart from the pure-logic suite
// (interaction-card.test.ts) because it needs react-dom/server and the real
// component tree.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChatInteractionCard,
  type ChatInteractionCardProps,
} from "../src/interaction-card.tsx";
import type { StepperState } from "../src/interaction-card-logic.ts";

Object.assign(globalThis, { React });
const { createElement } = React;

const STEPS: ChatInteractionCardProps["steps"] = [
  {
    kind: "question",
    id: "q1",
    question: "Which inbox should I watch?",
    options: [
      { id: "personal", label: "Personal" },
      { id: "work", label: "Work" },
    ],
  },
];

const card = (state?: StepperState): string =>
  renderToStaticMarkup(
    createElement(ChatInteractionCard, {
      steps: STEPS,
      onComplete: () => undefined,
      renderConnect: () => null,
      renderSignin: () => null,
      renderCredential: () => null,
      state,
    }),
  );

/** The free-text escape field is a <textarea>, so SSR prints its value as the
 *  element's child text rather than a value attribute. */
const draftText = (html: string): string =>
  /<textarea[^>]*>([^<]*)<\/textarea>/.exec(html)?.[1] ?? "";

describe("ChatInteractionCard controlled state", () => {
  it("renders the free-text draft carried by the supplied state", () => {
    const html = card({
      current: 0,
      reached: 0,
      answers: {},
      drafts: { q1: "hola" },
    });
    assert.equal(draftText(html), "hola");
  });

  it("starts empty with no state prop, so the uncontrolled default is unchanged", () => {
    assert.equal(draftText(card()), "");
  });
});
