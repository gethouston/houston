import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentReferences,
  buildAttachmentPrompt,
  withAttachmentPaths,
} from "./attachment-message.ts";

function file(name) {
  return { name };
}

test("attachment prompt preserves model-facing file paths", () => {
  assert.equal(
    withAttachmentPaths("Read this", ["/tmp/brief.pdf"]),
    "Read this\n\n[User attached these files. Read them with the Read tool if needed:\n- /tmp/brief.pdf]",
  );
});

test("attachment prompt includes display marker and hidden path block", () => {
  const prompt = buildAttachmentPrompt(
    "Summarize this",
    [file("brief.pdf")],
    ["/Users/ja/.houston/cache/attachments/brief.pdf"],
  );
  const match = prompt.match(/^<!--houston:attachments (\{.*\})-->/);

  assert.ok(match);
  assert.deepEqual(JSON.parse(match[1]), {
    message: "Summarize this",
    files: [
      {
        name: "brief.pdf",
        path: "/Users/ja/.houston/cache/attachments/brief.pdf",
      },
    ],
  });
  assert.match(
    prompt,
    /\[User attached these files\. Read them with the Read tool if needed:/,
  );
  assert.match(
    prompt,
    /- \/Users\/ja\/\.houston\/cache\/attachments\/brief\.pdf/,
  );
});

test("folder uploads collapse to one prompt line with a file count (HOU-808)", () => {
  assert.equal(
    withAttachmentPaths("Look at these", [
      "uploads/brief.pdf",
      "uploads/docs/a.md",
      "uploads/docs/guide/b.md",
      "uploads/data/rows.csv",
    ]),
    "Look at these\n\n[User attached these files. Read them with the Read tool if needed:\n" +
      "- uploads/brief.pdf\n" +
      "- uploads/docs/ (uploaded folder with 2 files inside)\n" +
      "- uploads/data/ (uploaded folder with 1 file inside)]",
  );
});

test("legacy absolute paths are never mistaken for folder uploads", () => {
  assert.equal(
    withAttachmentPaths("", ["/Users/ja/.houston/cache/attachments/brief.pdf"]),
    "[User attached these files. Read them with the Read tool if needed:\n- /Users/ja/.houston/cache/attachments/brief.pdf]",
  );
});

test("attachment references fall back to file name from path", () => {
  assert.deepEqual(attachmentReferences([], ["/tmp/report.csv"]), [
    { name: "report.csv", path: "/tmp/report.csv" },
  ]);
});
