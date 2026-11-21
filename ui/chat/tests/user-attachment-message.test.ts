import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeAttachmentMessage } from "../src/attachment-message.ts";
import { UserAttachmentMessage } from "../src/user-attachment-message.tsx";

const ANSWERS =
  '<!--houston:interaction-answers {"lines":[{"question":"Which character?","answer":"The fox"}]}-->\n\nWhich character?: The fox';

function markup(message: string): string {
  const body = `<!--houston:attachments ${JSON.stringify({
    message,
    files: [{ name: "fox.png", path: "uploads/fox.png" }],
  }).replace(/>/g, "\\u003e")}-->\n\n${message}`;
  const invocation = decodeAttachmentMessage(body);
  assert.ok(invocation, "the attachment marker did not decode");
  return renderToStaticMarkup(
    React.createElement(UserAttachmentMessage, { invocation }),
  );
}

describe("UserAttachmentMessage", () => {
  it("renders an interaction card's answers as their receipt beside the badge", () => {
    const html = markup(ANSWERS);
    assert.ok(html.includes(">Which character?</span>"));
    assert.ok(html.includes(">The fox</span>"));
    assert.ok(html.includes("1 file attached"));
    assert.ok(!html.includes("houston:interaction-answers"));
  });

  it("renders typed words as a plain bubble", () => {
    const html = markup("Here is the fox");
    assert.ok(html.includes(">Here is the fox</span>"));
    assert.ok(html.includes("1 file attached"));
  });
});
