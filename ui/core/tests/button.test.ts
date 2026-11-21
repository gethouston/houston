import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "../src/components/button.tsx";

Object.assign(globalThis, { React });
const { createElement } = React;

const attrs = (element: React.ReactElement): string =>
  renderToStaticMarkup(element);

describe("Button's type", () => {
  it("is `button`, so one inside a form never submits it by accident", () => {
    assert.match(
      attrs(createElement(Button, null, "Pick team")),
      /type="button"/,
    );
  });

  it("still lets the form's one submit control say so", () => {
    const html = attrs(createElement(Button, { type: "submit" }, "Save"));
    assert.match(html, /type="submit"/);
    assert.equal(html.match(/type=/g)?.length, 1);
  });

  it("carries a reset through untouched", () => {
    assert.match(
      attrs(createElement(Button, { type: "reset" }, "Reset")),
      /type="reset"/,
    );
  });

  it("puts no type on the child it only styles", () => {
    const html = attrs(
      createElement(
        Button,
        { asChild: true },
        createElement("a", { href: "/docs" }, "Docs"),
      ),
    );
    assert.match(html, /^<a /);
    assert.doesNotMatch(html, /type=/);
  });

  it("lets asChild pass a type down when the caller sets one", () => {
    const html = attrs(
      createElement(
        Button,
        { asChild: true, type: "submit" },
        createElement("button", null, "Save"),
      ),
    );
    assert.match(html, /type="submit"/);
  });
});
