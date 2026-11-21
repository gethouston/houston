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
  pressEnter,
  sendButton,
  type,
  win,
} from "./support/card-attachments-harness.ts";

const { act, createElement: h, useState } = await import("react");
const { createRoot } = await import("react-dom/client");

const photo = file("photo.png");
const WANTS: typeof OPEN = { ...OPEN, wantsFiles: true };

function uploadArea(): HTMLButtonElement | undefined {
  return Array.from(win.document.querySelectorAll("button")).find(
    (el) => el.textContent?.trim() === "Upload your files",
  );
}

function fileInput(): HTMLInputElement {
  const input = win.document.querySelector(
    'input[type="file"]:not([webkitdirectory])',
  ) as HTMLInputElement | null;
  assert.ok(input, "no file input");
  return input;
}

function drag(target: Element, kinds: string[], files: File[]): void {
  const dataTransfer = { types: ["Files"], files, dropEffect: "none" };
  for (const kind of kinds) {
    const event = new win.Event(kind, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    act(() => {
      target.dispatchEvent(event);
    });
  }
}

async function dropOn(target: Element, files: File[]): Promise<void> {
  drag(target, ["dragenter", "dragover", "drop"], files);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("question card upload area", () => {
  it("renders only on a question that wants files", () => {
    mountLog(panel(card([OPEN], [])));
    assert.equal(uploadArea(), undefined);
    assert.equal(byLabel("Attach files").length, 1);

    mountLog(panel(card([WANTS], [])));
    const area = uploadArea();
    assert.ok(area, "no upload area");
    assert.equal(area.type, "button");
    assert.equal(byLabel("Attach files").length, 0);
    const field = win.document.querySelector("textarea");
    assert.equal(field?.placeholder, "Or type your answer...");
  });

  it("takes its label and placeholder from the card's labels", () => {
    mountLog(
      panel(
        card([WANTS], [], {
          labels: {
            uploadFiles: "Sube tus archivos",
            filePlaceholder: "O escribe tu respuesta...",
          },
        }),
      ),
    );
    assert.ok(
      Array.from(win.document.querySelectorAll("button")).some(
        (el) => el.textContent?.trim() === "Sube tus archivos",
      ),
    );
    assert.equal(
      win.document.querySelector("textarea")?.placeholder,
      "O escribe tu respuesta...",
    );
  });

  it("opens the file picker on click", () => {
    mountLog(panel(card([WANTS], [])));
    let opened = 0;
    fileInput().click = () => {
      opened += 1;
    };
    click(uploadArea());
    assert.equal(opened, 1);
  });

  it("sends a picked file as the answer with no words", () => {
    const done: Completion[] = [];
    mountLog(panel(card([WANTS], done)));
    assert.equal(sendButton().disabled, true);

    const input = fileInput();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [photo],
    });
    act(() => {
      input.dispatchEvent(new win.Event("change", { bubbles: true }));
    });
    assert.equal(chips("photo.png"), 1);
    assert.ok(uploadArea(), "the area stays to add more");
    assert.equal(sendButton().disabled, false);

    click(sendButton());
    assert.equal(done.length, 1);
    assert.equal(done[0].answers[0].answer, "See attached");
    assert.deepEqual(done[0].files, [photo]);
  });

  it("adds a drop that resolves after the card moved on to the newer files", async () => {
    const done: Completion[] = [];
    const logo = file("logo.png");
    mountLog(
      panel(card([{ ...PICK, id: "q-char", wantsFiles: true }, OPEN], done)),
    );
    const area = uploadArea();
    assert.ok(area, "no upload area");
    drag(area, ["dragenter", "dragover", "drop"], [photo]);
    click(option("The fox"));
    assert.equal(uploadArea(), undefined);
    attach([logo]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(chips("logo.png"), 1);
    assert.equal(chips("photo.png"), 1);
    click(sendButton());
    assert.deepEqual(done[0].files, [logo, photo]);
  });

  it("lands a panel drop in the conversation it was dropped on", async () => {
    const rejected: unknown[] = [];
    const rejectAll = (incoming: File[]) => ({
      accepted: [],
      rejected: incoming.map((f) => ({ file: f, reason: "unsupported" })),
    });
    const inA = () => panel(card([WANTS], []), { sessionKey: "a" });
    const { render } = mountLog(inA());
    const question = Array.from(win.document.querySelectorAll("*")).find(
      (el) => el.childElementCount === 0 && el.textContent === WANTS.question,
    );
    assert.ok(question, "no question text");
    drag(question, ["dragenter", "dragover", "drop"], [photo]);
    render(
      panel(null, {
        sessionKey: "b",
        prepareAttachments: rejectAll,
        onAttachmentRejections: (r: unknown[]) => rejected.push(...r),
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(chips("photo.png"), 0);
    assert.deepEqual(rejected, []);

    render(inA());
    assert.equal(chips("photo.png"), 1);
  });

  it("keeps a drop on the area from reaching the panel's own drop target", async () => {
    const writes: File[][] = [];
    function Controlled() {
      const [files, setFiles] = useState<File[]>([]);
      return panel(card([WANTS], []), {
        attachments: files,
        onAttachmentsChange: (next: File[]) => {
          writes.push(next);
          setFiles(next);
        },
      });
    }
    mountLog(h(Controlled));
    const area = uploadArea();
    assert.ok(area, "no upload area");
    await dropOn(area, [photo]);
    assert.deepEqual(writes, [[photo]]);
  });

  it("clears its highlight when the card turns disabled mid-drag", () => {
    const { render } = mountLog(panel(card([WANTS], [])));
    const area = () => {
      const el = uploadArea();
      assert.ok(el, "no upload area");
      return el;
    };
    drag(area(), ["dragenter", "dragover"], [photo]);
    assert.equal(area().dataset.dragging, "true");

    render(panel(card([WANTS], [], { disabled: true })));
    assert.equal(area().dataset.dragging, undefined);

    render(panel(card([WANTS], [])));
    drag(area(), ["dragenter", "dragover", "dragleave"], [photo]);
    assert.equal(area().dataset.dragging, undefined);
  });

  it("keeps the answer field even when the options hide free text", () => {
    mountLog(
      panel(card([{ ...PICK, wantsFiles: true, hideFreeText: true }], [])),
    );
    assert.ok(win.document.querySelector("textarea"), "no answer field");
  });

  it("sends a file dropped on the area with the typed answer", async () => {
    const done: Completion[] = [];
    const notices: string[] = [];
    mountLog(
      panel(card([WANTS], done), {
        onNotice: (message: string) => notices.push(message),
      }),
    );
    const area = uploadArea();
    assert.ok(area, "no upload area");
    await dropOn(area, [photo]);

    assert.equal(chips("photo.png"), 1);
    assert.deepEqual(notices, []);
    type("Here it is");
    pressEnter();
    assert.equal(done[0].answers[0].answer, "Here it is");
    assert.deepEqual(done[0].files, [photo]);
  });

  it("highlights itself, not the panel's overlay, while a file is over it", () => {
    mountLog(panel(card([WANTS], [])));
    const area = uploadArea();
    assert.ok(area, "no upload area");
    const overlay = () =>
      win.document.body.textContent?.includes("Drop your files") === true;

    drag(area, ["dragenter", "dragover"], [photo]);
    assert.equal(area.dataset.dragging, "true");
    assert.equal(overlay(), false);

    drag(area, ["dragleave"], [photo]);
    assert.equal(area.dataset.dragging, undefined);
  });

  it("still answers with typed words and no file", () => {
    const done: Completion[] = [];
    mountLog(panel(card([WANTS], done)));
    type("I don't have one yet");
    pressEnter();
    assert.equal(done.length, 1);
    assert.equal(done[0].answers[0].answer, "I don't have one yet");
    assert.deepEqual(done[0].files, []);
  });

  it("shows the options below the area, and Skip declines", () => {
    const done: Completion[] = [];
    mountLog(panel(card([{ ...PICK, wantsFiles: true }], done)));
    const area = uploadArea();
    assert.ok(area && option("The fox"));
    assert.ok(
      area.compareDocumentPosition(option("The fox") as Node) &
        win.Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const skip = Array.from(win.document.querySelectorAll("button")).find(
      (el) => el.textContent?.startsWith("Skip"),
    );
    click(skip);
    assert.equal(done.length, 1);
    assert.deepEqual(done[0].answers, []);
  });

  it("offers no area outside a ChatPanel, where files have nowhere to go", () => {
    win.document.body.innerHTML = "";
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(card([WANTS], [])));
    assert.equal(uploadArea(), undefined);
    act(() => root.unmount());
  });
});
