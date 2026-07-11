import { expect, test } from "vitest";
import { buildAttachmentText, decodeAttachmentText } from "./attachment-text";

/**
 * The attachment marker is a CROSS-SURFACE wire format: desktop writes it, and
 * every surface (incl. iOS/Android) must read the SAME bytes. This pins it
 * byte-for-byte against the desktop encoder (`app/src/lib/attachment-message.ts`
 * — the `buildAttachmentPrompt` shape) so the two copies cannot drift while the
 * duplication awaits consolidation.
 */

// Copied verbatim from the desktop encoder's own test fixture
// (`app/src/lib/attachment-message.test.mjs`): the hidden marker, then the
// user text, then the visible model-facing path block. Note the file ref's key
// order is (path, name) — that is what the desktop encoder serializes.
const DESKTOP_FIXTURE =
  '<!--houston:attachments {"message":"Summarize this","files":[{"path":"/Users/ja/.houston/cache/attachments/brief.pdf","name":"brief.pdf"}]}-->\n\n' +
  "Summarize this\n\n" +
  "[User attached these files. Read them with the Read tool if needed:\n" +
  "- /Users/ja/.houston/cache/attachments/brief.pdf]";

test("buildAttachmentText matches the desktop marker byte-for-byte", () => {
  expect(
    buildAttachmentText(
      "Summarize this",
      ["/Users/ja/.houston/cache/attachments/brief.pdf"],
      ["brief.pdf"],
    ),
  ).toBe(DESKTOP_FIXTURE);
});

test("workspace-relative paths encode with a trimmed message", () => {
  expect(
    buildAttachmentText(
      "  Read these  ",
      ["uploads/a.pdf", "uploads/b.png"],
      ["a.pdf", "b.png"],
    ),
  ).toBe(
    '<!--houston:attachments {"message":"Read these","files":[{"path":"uploads/a.pdf","name":"a.pdf"},{"path":"uploads/b.png","name":"b.png"}]}-->\n\n' +
      "  Read these  \n\n" +
      "[User attached these files. Read them with the Read tool if needed:\n" +
      "- uploads/a.pdf\n- uploads/b.png]",
  );
});

test("empty text drops the user line but keeps the marker + path block", () => {
  expect(buildAttachmentText("", ["uploads/a.pdf"], ["a.pdf"])).toBe(
    '<!--houston:attachments {"message":"","files":[{"path":"uploads/a.pdf","name":"a.pdf"}]}-->\n\n' +
      "[User attached these files. Read them with the Read tool if needed:\n" +
      "- uploads/a.pdf]",
  );
});

test("a missing name falls back to the path basename", () => {
  expect(buildAttachmentText("hi", ["uploads/report.csv"])).toBe(
    '<!--houston:attachments {"message":"hi","files":[{"path":"uploads/report.csv","name":"report.csv"}]}-->\n\n' +
      "hi\n\n" +
      "[User attached these files. Read them with the Read tool if needed:\n" +
      "- uploads/report.csv]",
  );
});

test("no paths returns the text unchanged (no marker)", () => {
  expect(buildAttachmentText("just text", [])).toBe("just text");
  expect(buildAttachmentText("", [])).toBe("");
});

test("decodeAttachmentText round-trips a built marker", () => {
  const text = buildAttachmentText(
    "Summarize this",
    ["uploads/brief.pdf", "uploads/notes.txt"],
    ["brief.pdf", "notes.txt"],
  );
  expect(decodeAttachmentText(text)).toEqual({
    displayText: "Summarize this",
    attachments: [{ name: "brief.pdf" }, { name: "notes.txt" }],
  });
});

test("decodeAttachmentText reads the desktop fixture (name-first order too)", () => {
  // The desktop decoder's own fixture serializes files name-first; decode is
  // key-order independent (JSON.parse), so it must still resolve.
  const body =
    '<!--houston:attachments {"message":"Read this","files":[{"name":"brief.pdf","path":"/tmp/brief.pdf"}]}-->\n\nRead this\n\n[User attached these files. Read them with the Read tool if needed:\n- /tmp/brief.pdf]';
  expect(decodeAttachmentText(body)).toEqual({
    displayText: "Read this",
    attachments: [{ name: "brief.pdf" }],
  });
});

test("decodeAttachmentText returns null when there is no marker or no files", () => {
  expect(decodeAttachmentText("hello")).toBeNull();
  expect(
    decodeAttachmentText(
      '<!--houston:attachments {"message":"x","files":[]}-->',
    ),
  ).toBeNull();
  // Malformed JSON never throws.
  expect(
    decodeAttachmentText("<!--houston:attachments {not json}-->\n\nhi"),
  ).toBeNull();
});
