import { match, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrowserHandoffCard } from "../src/browser-handoff-card.tsx";
import type { BrowserHandoffCardState } from "../src/browser-live-types.ts";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const render = (
  props: Partial<React.ComponentProps<typeof BrowserHandoffCard>> = {},
) =>
  renderToStaticMarkup(
    React.createElement(BrowserHandoffCard, {
      site: "bank.example.com",
      task: "Sign in to your bank",
      state: "waiting",
      onOpen: () => {},
      ...props,
    }),
  );

describe("browser hand-off card", () => {
  it("names the site and offers a visible 44 px Open while waiting", () => {
    const html = render();
    match(html, /Your turn on bank\.example\.com/);
    match(html, /Sign in to your bank/);
    match(html, />Open</);
    match(html, /aria-label="Open the browser for bank\.example\.com"/);
    match(html, /min-h-11/);
  });

  it("falls back to the browser when there is no site", () => {
    const html = render({ site: null });
    match(html, /Your turn in the browser/);
    match(html, /aria-label="Open the browser"/);
  });

  const outcomes: [BrowserHandoffCardState, RegExp][] = [
    ["done", />Done</],
    ["cancelled", />Not finished</],
    ["expired", />Time ran out</],
    ["ended", />No longer waiting</],
  ];
  for (const [state, line] of outcomes) {
    it(`keeps the ${state} outcome and drops Open`, () => {
      const html = render({ state });
      match(html, line);
      strictEqual(html.includes(">Open<"), false);
    });
  }

  it("takes partial host labels and keeps English for the rest", () => {
    const html = render({
      labels: {
        heading: (site: string) => `Te toca en ${site}`,
        open: "Abrir",
      },
    });
    match(html, /Te toca en bank\.example\.com/);
    match(html, />Abrir</);
    match(html, /aria-label="Open the browser for bank\.example\.com"/);
  });

  it("marks a waiting card live and keeps the outcome where Open was", () => {
    match(render(), /browser-handoff-live-dot/);
    const done = render({ state: "done" });
    strictEqual(done.includes("browser-handoff-live-dot"), false);
    match(done, /text-success-ink/);
    strictEqual(done.includes("browser-handoff-swap-in"), false);
  });
});
