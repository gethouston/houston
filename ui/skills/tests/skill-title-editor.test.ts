import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditableSkillTitle } from "../src/skill-title-editor.tsx";

const render = (props: Parameters<typeof EditableSkillTitle>[0]) =>
  renderToStaticMarkup(React.createElement(EditableSkillTitle, props));

describe("EditableSkillTitle", () => {
  it("is the page's h1 where the skill owns the screen", () => {
    const html = render({ title: "Weekly report" });
    assert.match(html, /<h1[^>]*>Weekly report<\/h1>/);
  });

  it("drops to an h2 where the frame already carries the h1", () => {
    const html = render({ title: "Weekly report", level: 2 });
    assert.match(html, /<h2[^>]*>Weekly report<\/h2>/);
    assert.doesNotMatch(html, /<h1/);
  });

  it("keeps the rename pencil only when a rename is possible", () => {
    assert.doesNotMatch(render({ title: "Weekly report" }), /<button/);
    assert.match(
      render({ title: "Weekly report", onRename: () => {}, level: 2 }),
      /<button/,
    );
  });
});
