import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { TooltipProvider } from "@houston-ai/core";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sidebarRowButtonClasses as c } from "../src/sidebar-paint";
import { SidebarProfileMenu } from "../src/sidebar-profile-menu";
import { SidebarRowButton } from "../src/sidebar-row-button";

Object.assign(globalThis, { React });
const h = React.createElement;

describe("a person row's two lines", () => {
  const profile = renderToStaticMarkup(
    h(
      TooltipProvider,
      null,
      h(
        SidebarProfileMenu,
        { avatar: h("span"), title: "Julian Arango", subtitle: "Acme Inc" },
        h("span"),
      ),
    ),
  );
  const agent = renderToStaticMarkup(
    h(SidebarRowButton, {
      anatomy: "person",
      label: "Tax Bot",
      subtitle: "Q3 reconciliation",
    }),
  );

  it("sit each in its own line box, in the account row as in an employee's", () => {
    for (const markup of [profile, agent]) {
      const lineBox = `<span class="${c.personLine}"><span class="${c.personName}">`;
      assert.ok(markup.includes(lineBox), "the name is in a line box");
      assert.ok(
        markup.includes(
          `<span class="${c.personLine}"><span class="${c.personRole}">`,
        ),
        "the second line is in a line box",
      );
    }
  });

  it("never stretches the name along the column", () => {
    assert.ok(!c.personName.split(" ").includes("flex-1"));
  });
});
