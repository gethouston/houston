import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildAttachmentText } from "@houston/sdk";
import { decodeAttachmentMessage } from "@houston-ai/chat";
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
    const marker = app.split("\n")[0];
    strictEqual(marker.indexOf("-->"), marker.length - 3);
    strictEqual(decodeAttachmentMessage(app)?.message, text);
  });
});
