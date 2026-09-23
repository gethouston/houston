import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Progress } from "../src/components/progress.tsx";

Object.assign(globalThis, { React });

const attribute = (html: string, name: string) =>
  new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];

describe("Progress", () => {
  it("tells assistive technology the value the bar draws", () => {
    // Radix only announces a determinate bar when the root receives `value`;
    // a fill drawn from the prop alone is a progressbar that reads as
    // indeterminate and never says how far along it is.
    const html = renderToStaticMarkup(
      React.createElement(Progress, { value: 67, "aria-label": "Step 2 of 3" }),
    );
    assert.equal(attribute(html, "role"), "progressbar");
    assert.equal(attribute(html, "aria-valuenow"), "67");
    assert.equal(attribute(html, "data-state"), "loading");
    assert.equal(attribute(html, "aria-label"), "Step 2 of 3");
  });

  it("is complete at 100", () => {
    const html = renderToStaticMarkup(
      React.createElement(Progress, { value: 100 }),
    );
    assert.equal(attribute(html, "aria-valuenow"), "100");
    assert.equal(attribute(html, "data-state"), "complete");
  });

  it("is indeterminate with no value", () => {
    const html = renderToStaticMarkup(React.createElement(Progress));
    assert.equal(attribute(html, "aria-valuenow"), undefined);
    assert.equal(attribute(html, "data-state"), "indeterminate");
  });
});
