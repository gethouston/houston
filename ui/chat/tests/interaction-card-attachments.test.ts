import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  attach,
  byLabel,
  type Completion,
  card,
  chips,
  click,
  file,
  mountLog,
  OPEN,
  option,
  PICK,
  panel,
  sendButton,
  win,
} from "./support/card-attachments-harness.ts";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

const photo = file("photo.png");

describe("question card attachments", () => {
  it("shows the panel's files and hands them over with a picked option", () => {
    const done: Completion[] = [];
    const changes: File[][] = [];
    mountLog(
      panel(card([PICK], done), {
        attachments: [photo],
        onAttachmentsChange: (files: File[]) => changes.push(files),
      }),
    );
    assert.equal(byLabel("Attach files").length, 1);
    assert.equal(chips("photo.png"), 1);

    click(option("The fox"));

    assert.equal(done.length, 1);
    assert.deepEqual(
      done[0].answers.map((a) => a.answer),
      ["The fox"],
    );
    assert.deepEqual(done[0].files, [photo]);
    assert.deepEqual(changes, []);
  });

  it("answers a free-text question with a picked file and no words", () => {
    const done: Completion[] = [];
    mountLog(
      panel(card([OPEN], done, { labels: { attachedAnswer: "Ver adjunto" } })),
    );
    assert.equal(sendButton().disabled, true);

    attach([photo]);
    assert.equal(chips("photo.png"), 1);
    assert.equal(sendButton().disabled, false);

    click(sendButton());
    assert.equal(done.length, 1);
    assert.deepEqual(done[0].answers, [
      {
        stepId: "q-image",
        question: "Send me its image",
        answer: "Ver adjunto",
        source: "text",
      },
    ]);
    assert.deepEqual(done[0].files, [photo]);
    assert.equal(chips("photo.png"), 0);
  });

  it("keeps the attach control when the question hides its free text", () => {
    mountLog(panel(card([{ ...PICK, hideFreeText: true }], [])));
    assert.equal(win.document.querySelectorAll("textarea").length, 0);
    assert.equal(byLabel("Attach files").length, 1);
  });

  it("leaves the attachments to the composer when the card sits above it", () => {
    mountLog(
      panel(card([PICK], []), {
        composerOverrideMode: "above",
        attachments: [photo],
      }),
    );
    assert.equal(byLabel("Attach files").length, 1);
    assert.equal(chips("photo.png"), 1);
    assert.ok(win.document.querySelector('textarea[name="message"]'));
  });

  it("offers no attach control outside a ChatPanel, and hands over no files", () => {
    const done: Completion[] = [];
    win.document.body.innerHTML = "";
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(card([PICK], done)));
    assert.equal(byLabel("Attach files").length, 0);
    click(option("The owl"));
    assert.deepEqual(done[0].files, []);
    act(() => root.unmount());
  });
});
