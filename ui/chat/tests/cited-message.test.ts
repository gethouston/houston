import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  encodeCitationsEnvelope,
  type SentCitation,
} from "@houston/wire-types/citations";
import { decodeCitedMessage } from "../src/cited-message.ts";
import { messagePreviewText } from "../src/message-preview.ts";

const pill = (n: number, comment: string): SentCitation => ({
  n,
  filePath: "decks/deck.pptx",
  fileName: "deck.pptx",
  page: n + 1,
  kind: "area",
  comment,
});
const cited = (words: string, ...pills: SentCitation[]) =>
  `${words}\n\n${encodeCitationsEnvelope(pills, "[list]")}`;

// The app's attachment marker, byte for byte (app/src/lib/attachment-message.ts).
const attached = (words: string, path: string) =>
  `<!--houston:attachments ${JSON.stringify({
    message: words,
    files: [{ name: "brief.pdf", path }],
  }).replace(
    />/g,
    "\\u003e",
  )}-->\n\n${words}\n\n[User attached these files. Read them with the Read tool if needed:\n- ${path}]`;

// The app's Skill marker and prompt (app/src/lib/skill-message.ts).
const skilled = (words: string) =>
  `<!--houston:skill ${JSON.stringify({
    skill: "polish-deck",
    displayName: "Polish deck",
    image: null,
    description: "Tidy every slide",
    integrations: [],
    fields: [],
    message: words,
    attachments: [{ name: "logo.png", path: "uploads/logo.png" }],
  })}-->\n\nUse the polish-deck skill.\n\n${words}`;

describe("decodeCitedMessage", () => {
  it("answers null for a message without comments", () => {
    assert.equal(decodeCitedMessage("just words"), null);
    assert.equal(decodeCitedMessage(attached("hi", "uploads/a.pdf")), null);
  });

  it("keeps every send's words, files and comments in a queue-merged body", () => {
    const body = [
      attached("Read the brief", "uploads/brief.pdf"),
      cited("Then fix these", pill(1, "Bigger title")),
      attached(cited("And this", pill(2, "Brand green")), "uploads/two.pdf"),
      "one last thing",
    ].join("\n\n");
    assert.deepEqual(decodeCitedMessage(body), {
      text: "Read the brief\n\nThen fix these\n\nAnd this\n\none last thing",
      citations: [pill(1, "Bigger title"), pill(2, "Brand green")],
      attachments: [
        { name: "brief.pdf", path: "uploads/brief.pdf" },
        { name: "brief.pdf", path: "uploads/two.pdf" },
      ],
      skill: null,
    });
  });

  it("decodes a Skill send's comments and keeps its Skill and files", () => {
    const decoded = decodeCitedMessage(
      skilled(cited("Use our colors", pill(1, "Brand green"))),
    );
    assert.equal(decoded?.text, "Use our colors");
    assert.deepEqual(decoded?.citations, [pill(1, "Brand green")]);
    assert.deepEqual(decoded?.attachments, [
      { name: "logo.png", path: "uploads/logo.png" },
    ]);
    assert.equal(decoded?.skill?.displayName, "Polish deck");
  });

  it("previews a comments-only Skill send as the Skill's description", () => {
    assert.equal(
      messagePreviewText(skilled(cited("", pill(1, "x")))),
      "Tidy every slide",
    );
  });
});
