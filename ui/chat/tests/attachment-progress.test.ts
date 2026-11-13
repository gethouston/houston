import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { win } from "./support/conversation-log-dom.ts";

const { act, createElement: h, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AttachmentChip } = await import("../src/attachment-chip.tsx");
const { AttachmentProgressProvider } = await import(
  "../src/attachment-progress.tsx"
);
const { ChatInputAttachments } = await import(
  "../src/chat-input-attachments.tsx"
);
let root: ReturnType<typeof createRoot>;
const labels = {
  uploading: "Subiendo…",
  reconnecting: "Reconectando…",
  saving: "Guardando…",
};

beforeEach(() => {
  const container = win.document.createElement("div");
  win.document.body.replaceChildren(container);
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

test("a chip renders real progress, localized reconnecting and saving states", () => {
  const render = (state: "uploading" | "reconnecting" | "saving") =>
    act(() =>
      root.render(
        h(AttachmentChip, {
          name: "report.pdf",
          onRemove() {},
          labels,
          progress: { fraction: 0.42, state },
        }),
      ),
    );
  render("uploading");
  const bar = () => win.document.querySelector('[role="progressbar"]');
  assert.equal(bar()?.getAttribute("aria-valuenow"), "42");
  assert.equal(bar()?.getAttribute("aria-label"), "report.pdf");
  assert.match(win.document.body.textContent ?? "", /Subiendo… 42%/);
  render("reconnecting");
  assert.equal(bar()?.getAttribute("aria-valuenow"), "42");
  assert.equal(bar()?.getAttribute("aria-valuetext"), "Reconectando…");
  render("saving");
  assert.match(win.document.body.textContent ?? "", /Guardando…/);
  act(() =>
    root.render(h(AttachmentChip, { name: "report.pdf", onRemove() {} })),
  );
  assert.equal(bar(), null);
  assert.equal(
    win.document.querySelector("button")?.getAttribute("aria-label"),
    "Remove report.pdf",
  );
});

test("the progress prop has an English default label", () => {
  act(() =>
    root.render(
      h(AttachmentChip, {
        name: "file.pdf",
        onRemove() {},
        progress: { fraction: 0.1, state: "reconnecting" },
      }),
    ),
  );
  assert.match(win.document.body.textContent ?? "", /Reconnecting…/);
});

test("a folder combines file progress by size and clears when no report remains", () => {
  const big = new File([new Uint8Array(90)], "report.pdf");
  const small = new File([new Uint8Array(10)], "notes.txt");
  Object.defineProperty(big, "webkitRelativePath", {
    value: "Folder/report.pdf",
  });
  Object.defineProperty(small, "webkitRelativePath", {
    value: "Folder/notes.txt",
  });
  const render = (
    progress: ReadonlyMap<
      File,
      import("../src/attachment-progress.tsx").AttachmentUploadProgress
    >,
  ) =>
    act(() =>
      root.render(
        h(
          AttachmentProgressProvider,
          {
            value: { progress, labels },
          },
          h(ChatInputAttachments, {
            files: [big, small],
            fileInputRef: createRef(),
            folderInputRef: createRef(),
            onFileChange() {},
            onRemoveFiles() {},
          }),
        ),
      ),
    );
  render(new Map([[big, { fraction: 0.4, state: "reconnecting" }]]));
  assert.equal(win.document.querySelectorAll('[role="progressbar"]').length, 1);
  assert.equal(
    win.document
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow"),
    "46",
  );
  assert.match(win.document.body.textContent ?? "", /Reconectando…/);
  render(new Map());
  assert.equal(win.document.querySelector('[role="progressbar"]'), null);
});
