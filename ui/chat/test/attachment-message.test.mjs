import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeAttachmentMessage,
  normalizeAttachmentReferences,
} from "../src/attachment-message.ts";

test("decodes attachment marker without exposing prompt body", () => {
  const body =
    '<!--houston:attachments {"message":"Read this","files":[{"name":"brief.pdf","path":"/tmp/brief.pdf"}]}-->\n\nRead this\n\n[User attached these files. Read them with the Read tool if needed:\n- /tmp/brief.pdf]';

  assert.deepEqual(decodeAttachmentMessage(body), {
    message: "Read this",
    files: [{ name: "brief.pdf", path: "/tmp/brief.pdf" }],
  });
});

test("normalizes names from paths when marker omits file name", () => {
  assert.deepEqual(
    normalizeAttachmentReferences([
      { path: "C:\\Users\\ja\\Desktop\\notes.txt" },
    ]),
    [{ name: "notes.txt", path: "C:\\Users\\ja\\Desktop\\notes.txt" }],
  );
});

test("ignores invalid attachment marker payloads", () => {
  assert.equal(decodeAttachmentMessage("hello"), null);
  assert.equal(
    decodeAttachmentMessage(
      '<!--houston:attachments {"message":"x","files":[]}-->',
    ),
    null,
  );
});
