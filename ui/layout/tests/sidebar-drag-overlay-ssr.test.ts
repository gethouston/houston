import { strict as assert } from "node:assert";
import { it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarDragOverlay } from "../src/sidebar-drag-overlay";

Object.assign(globalThis, { React });

it("renders nothing, and does not throw, where there is no document", () => {
  assert.equal(typeof document, "undefined");
  const markup = renderToStaticMarkup(
    React.createElement(SidebarDragOverlay, {
      rowCtx: { selectedId: null, onSelect: () => undefined },
    }),
  );
  assert.equal(markup, "");
});
