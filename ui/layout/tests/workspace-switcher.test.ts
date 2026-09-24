import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { TooltipProvider } from "@houston-ai/core";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sidebarRowButtonClasses, sidebarRowState } from "../src/sidebar-paint";
import { WorkspaceSwitcher } from "../src/workspace-switcher";

Object.assign(globalThis, { React });
const h = React.createElement;
function render(collapsed: boolean) {
  return renderToStaticMarkup(
    h(
      TooltipProvider,
      null,
      h(WorkspaceSwitcher, {
        workspaces: [],
        currentId: null,
        currentName: "moonshot",
        collapsed,
        onSwitch: () => undefined,
        onCreate: () => undefined,
      }),
    ),
  );
}

const AVATAR =
  /<span aria-hidden="true" class="[^"]*border-ink-muted[^"]*">M<\/span>/;

describe("workspace switcher", () => {
  it("wears the same avatar in front of the name when expanded", () => {
    const markup = render(false);
    assert.match(markup, AVATAR);
    assert.ok(markup.indexOf(">M</span>") < markup.indexOf(">moonshot</span>"));
  });

  it("is built from the rail row's anatomy when expanded", () => {
    // The pill's `content-['']` and `has-[>button]` are attribute-escaped.
    const markup = render(false)
      .replaceAll("&#x27;", "'")
      .replaceAll("&gt;", ">");
    const root = sidebarRowButtonClasses.root.split(" ");
    const button = sidebarRowButtonClasses.button.split(" ");
    for (const cls of [
      ...root.filter((cls) => cls !== "h-7"),
      sidebarRowState.hover,
    ]) {
      assert.ok(markup.includes(cls), `row root carries ${cls}`);
    }
    for (const cls of button.filter((cls) => cls !== "h-7")) {
      assert.ok(markup.includes(cls), `row button carries ${cls}`);
    }
  });

  it("collapses to the avatar in a rail-style button with no resting fill", () => {
    const markup = render(true);
    assert.match(markup, AVATAR);
    const button = markup.match(/<button[^>]*aria-label="moonshot"[^>]*>/);
    assert.ok(button, "collapsed trigger is labelled with the workspace name");
    assert.match(button[0], /hover:bg-hover/);
    assert.doesNotMatch(button[0], /class="[^"]*(?<!hover:)bg-hover/);
    assert.match(button[0], /focus-visible:ring-2/);
  });

  it("renders a 40px phone row and a 28px desktop row on root and button", () => {
    const markup = render(false);
    const root = markup.match(/<div class="([^"]*group\/row[^"]*)"/);
    const button = markup.match(/<button[^>]*class="([^"]*)"/);
    assert.ok(root);
    assert.ok(button);
    for (const classes of [root[1], button[1]]) {
      assert.ok(classes.split(" ").includes("h-10"), classes);
      assert.ok(classes.split(" ").includes("md:h-7"), classes);
      assert.ok(!classes.split(" ").includes("h-7"), classes);
    }
  });
});
