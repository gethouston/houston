import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "../src/components/button.tsx";

Object.assign(globalThis, { React });
const { createElement } = React;

/**
 * A `<button>` with no `type` is a SUBMIT button — the HTML default — so one
 * dropped inside a form fires that form. `FormDialog` puts a real `<form>`
 * around its fields, which turned every plain Button among them (a team row,
 * a "Get your API key", a segmented choice) into a second submit: clicking it
 * saved the form with whatever was selected a moment ago (PRODUCT-1523, the
 * copy-agent dialog copying into the previous team).
 *
 * The fix is the default, not the call sites: `type="button"` unless the
 * caller asks otherwise, so a Button placed in a form does nothing but its own
 * job and the ONE control meant to submit says so out loud.
 */
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
    // `asChild` hands the classes to someone else's element — an anchor, a
    // Radix trigger. `type` is not a valid attribute on most of them, and the
    // ones that are buttons bring their own.
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
