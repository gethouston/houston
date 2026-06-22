import test from "node:test";
import assert from "node:assert/strict";
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

test("attachment references fall back to file name from path", () => {
  assert.deepEqual(attachmentReferences([], ["/tmp/report.csv"]), [
    { name: "report.csv", path: "/tmp/report.csv" },
  ]);
});
