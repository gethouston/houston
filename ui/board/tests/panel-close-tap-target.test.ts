import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KanbanDetailPanel } from "../src/kanban-detail-panel.tsx";

Object.assign(globalThis, { React });

const UNIT_PX = 4;
const MENU_SLOP_PX = 8;

describe("detail panel close X", () => {
  it("reaches 44px tall on a phone without overlapping the menu's slop", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        KanbanDetailPanel,
        {
          title: "Plan a trip",
          onClose: () => undefined,
          closeLabel: "Close",
          actions: React.createElement("button", { type: "button" }, "menu"),
        },
        React.createElement("div"),
      ),
    );
    const close = html.match(/<button[^>]*aria-label="Close"[^>]*>/)?.[0];
    assert.ok(close, "no close button");
    const c = (close.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    const px = (prefix: string) => {
      const k = c.find((x) => x.startsWith(prefix));
      assert.ok(k, `missing ${prefix}`);
      return Number(k.slice(prefix.length)) * UNIT_PX;
    };
    assert.ok(c.includes("relative") && c.includes("after:absolute"));
    assert.ok(c.includes("md:after:hidden"), "no slop on desktop");
    assert.ok(px("size-") + 2 * px("after:-inset-y-") >= 44, "44px tall");
    const menuAt = html.indexOf(">menu</button>");
    const rowOpen = html.lastIndexOf('class="@container', menuAt);
    const rowGap = html
      .slice(rowOpen, html.indexOf(">", rowOpen))
      .match(/\sgap-(\d+(?:\.\d+)?)/);
    assert.ok(rowGap, "no row gap");
    assert.ok(
      px("after:-left-") + MENU_SLOP_PX <= Number(rowGap[1]) * UNIT_PX,
      "the close and menu hit areas overlap",
    );
  });
});
