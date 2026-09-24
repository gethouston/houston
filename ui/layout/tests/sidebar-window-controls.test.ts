import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { TooltipProvider } from "@houston-ai/core";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSidebar } from "../src/sidebar";
import { WorkspaceSwitcher } from "../src/workspace-switcher";

Object.assign(globalThis, { React });
const h = React.createElement;
function render(windowControlsInset?: boolean, collapsed = false) {
  return renderToStaticMarkup(
    h(
      TooltipProvider,
      null,
      h(AppSidebar, {
        windowControlsInset,
        collapsed,
        items: [],
        onSelect: () => undefined,
        onToggleCollapsed: () => undefined,
        header: h(WorkspaceSwitcher, {
          workspaces: [],
          currentId: null,
          currentName: "Workspace",
          compactTop: windowControlsInset || collapsed,
          collapsed,
          onSwitch: () => undefined,
          onCreate: () => undefined,
        }),
      }),
    ),
  );
}

describe("sidebar window controls inset", () => {
  it("defaults to the no-inset header with the toggle beside the switcher", () => {
    const markup = render(false);
    assert.equal(render(), markup);
    assert.ok(!markup.includes("data-window-controls-row"));
    assert.match(
      markup,
      /Workspace<\/span>.*<div class="shrink-0 pt-3 pr-2 pb-0.5"><button[^>]*aria-label="Collapse sidebar"/,
    );
    assert.ok(markup.includes("px-2 pt-3 pb-0.5"));
    const collapsed = render(false, true);
    assert.ok(collapsed.includes("w-[56px]"));
    assert.match(
      collapsed,
      /class="flex justify-center pt-3 pb-1"><button[^>]*aria-label="Expand sidebar"/,
    );
    assert.ok(
      collapsed.indexOf('aria-label="Expand sidebar"') <
        collapsed.indexOf('aria-label="Workspace"'),
    );
    assert.equal(collapsed.match(/aria-label="Expand sidebar"/g)?.length, 1);
    assert.ok(!collapsed.includes("cursor-pointer"));
    assert.ok(collapsed.includes("pt-0"));
    assert.ok(!collapsed.includes('<aside data-tour-target="sidebar" onClick'));
  });

  it("puts the reserved zone and toggle before a compact full-width header", () => {
    const markup = render(true);
    assert.ok(markup.includes("w-[220px]"));
    assert.match(markup, /data-window-controls-row="true" class="[^"]*h-10/);
    assert.match(
      markup,
      /data-tauri-drag-region="true" class="h-full shrink-0 w-\[84px\]"><\/div><button[^>]*aria-label="Collapse sidebar"/,
    );
    assert.ok(
      markup.indexOf('aria-label="Collapse sidebar"') <
        markup.indexOf("Workspace</span>"),
    );
    assert.ok(!markup.includes("shrink-0 pt-3 pr-2 pb-0.5"));
    assert.ok(markup.includes("pt-0"));
    assert.ok(markup.includes("transition-[width]"));
  });

  it("widens the collapsed rail and leaves its controls row empty", () => {
    const markup = render(true, true);
    assert.ok(markup.includes("w-[84px]"));
    assert.match(
      markup,
      /data-window-controls-row="true" class="[^"]*h-10"><\/div>/,
    );
    assert.ok(!markup.includes('aria-label="Collapse sidebar"'));
    assert.ok(markup.includes('aria-label="Expand sidebar"'));
    assert.match(
      markup,
      /data-window-controls-row="true" class="[^"]*h-10"><\/div><div data-tauri-drag-region="true" class="flex justify-center pt-3 pb-1"><button[^>]*aria-label="Expand sidebar"/,
    );
    assert.ok(
      markup.indexOf('aria-label="Expand sidebar"') <
        markup.indexOf('aria-label="Workspace"'),
    );
    assert.ok(!markup.includes("cursor-pointer"));
  });

  it("marks the collapsed inset toggle row as a direct drag region", () => {
    const markup = render(true, true);
    assert.match(
      markup,
      /data-window-controls-row="true"[^>]*><\/div><div data-tauri-drag-region="true" class="flex justify-center pt-3 pb-1"><button/,
    );
  });
});
