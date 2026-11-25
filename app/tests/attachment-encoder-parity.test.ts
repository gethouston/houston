// The app's composer encoder and the SDK's must emit the same bytes, or one
// surface's attachment marker stops decoding on the other. The app keeps its
// own copy because it groups folder uploads into one prompt line, which the
// SDK's does not; for flat uploads they must match exactly.

import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { decodeAttachmentMessage } from "@houston-ai/chat";
import { buildAttachmentText } from "@houston/sdk";
import { buildAttachmentPrompt } from "../src/lib/attachment-message.ts";

describe("attachment marker encoders", () => {
  it("emit identical bytes for text carrying '>' and '-->'", () => {
    const text =
      '<!--houston:interaction-answers {"lines":[{"answer":"a > b"}]}-->\n\nIs 3 > 2? Yes --> see attached';
    const files = [
      new File(["png"], "fox.png", { type: "image/png" }),
      new File(["pdf"], "contract.pdf", { type: "application/pdf" }),
    ];
    const paths = ["uploads/fox.png", "uploads/contract.pdf"];

    const app = buildAttachmentPrompt(text, files, paths);
    const sdk = buildAttachmentText(
      text,
      paths,
      files.map((f) => f.name),
    );
    strictEqual(app, sdk);
    // The marker closes once, at its own end, never inside the text.
    const marker = app.split("\n")[0];
    strictEqual(marker.indexOf("-->"), marker.length - 3);
    strictEqual(decodeAttachmentMessage(app)?.message, text);
  });
});
