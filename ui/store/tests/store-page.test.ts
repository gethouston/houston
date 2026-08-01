import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  StorePage,
  StorePageHeader,
  StoreSection,
} from "../src/components/store-page.tsx";

// The components are written in TSX, but node's type stripping does not
// transform JSX, so the specimens under test are built with createElement.

describe("StorePage", () => {
  it("wraps children in the centred 1040px measure with the page gutters", () => {
    const html = renderToStaticMarkup(
      createElement(StorePage, null, createElement("p", null, "body")),
    );
    assert.match(html, /max-w-\[1040px\]/);
    assert.match(html, /px-6/);
    assert.match(html, /md:px-8/);
    assert.match(html, /<p>body<\/p>/);
  });

  it("owns the 40 / 64px rhythm between blocks so sections stay margin-free", () => {
    const html = renderToStaticMarkup(createElement(StorePage, null));
    assert.match(html, /gap-10/);
    assert.match(html, /md:gap-16/);
  });

  it("merges a caller className instead of dropping it", () => {
    const html = renderToStaticMarkup(
      createElement(StorePage, { className: "pb-0" }),
    );
    assert.match(html, /class="[^"]*pb-0/);
  });
});

describe("StorePageHeader", () => {
  it("renders the title as the page's h1", () => {
    const html = renderToStaticMarkup(
      createElement(StorePageHeader, { title: "Agent Store" }),
    );
    assert.match(html, /<h1[^>]*>Agent Store<\/h1>/);
  });

  it("omits the subtitle and the actions slot when they are not given", () => {
    const html = renderToStaticMarkup(
      createElement(StorePageHeader, { title: "Agent Store" }),
    );
    assert.equal(html.includes("shrink-0 items-center"), false);
    assert.equal(html.includes("<p"), false);
  });

  it("renders the subtitle and right-aligned actions when they are", () => {
    const html = renderToStaticMarkup(
      createElement(StorePageHeader, {
        title: "Agent Store",
        subtitle: "148 agents",
        actions: createElement("button", { type: "button" }, "Publish"),
      }),
    );
    assert.match(html, /148 agents/);
    assert.match(html, /<button type="button">Publish<\/button>/);
  });
});

describe("StoreSection", () => {
  it("renders no head at all when it has no title, description or actions", () => {
    const html = renderToStaticMarkup(
      createElement(StoreSection, null, createElement("p", null, "rows")),
    );
    assert.equal(html.includes("<h2"), false);
    assert.match(html, /<section[^>]*><p>rows<\/p><\/section>/);
  });

  it("renders the title as an h2 with its description", () => {
    const html = renderToStaticMarkup(
      createElement(StoreSection, {
        title: "Featured",
        description: "Picked this week",
      }),
    );
    assert.match(html, /<h2[^>]*>Featured<\/h2>/);
    assert.match(html, /Picked this week/);
  });

  it("carries no outer margin — the rhythm belongs to StorePage", () => {
    const html = renderToStaticMarkup(
      createElement(StoreSection, { title: "Featured" }),
    );
    const sectionClass = /<section[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
    assert.equal(/(^|\s)m[trblxy]?-/.test(sectionClass), false);
  });
});
