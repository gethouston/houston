import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  attach,
  byLabel,
  type CardProps,
  type Completion,
  card,
  chips,
  click,
  deferred,
  file,
  flush,
  mountLog,
  OPEN,
  PICK,
  panel,
  pressEnter,
  type Step,
  sendButton,
  type,
  win,
} from "./support/card-attachments-harness.ts";

const { act, createElement: h } = await import("react");
(globalThis as { FormData: unknown }).FormData = win.FormData;

type StepperState = NonNullable<CardProps["state"]>;

const COMPANY: Step = {
  kind: "question",
  id: "q-company",
  question: "Company name?",
};
const LOGO: Step = { kind: "question", id: "q-logo", question: "Your logo" };
const CONNECT: Step = { kind: "connect", id: "c-gmail", toolkit: "gmail" };

const pairs = (c: Completion) => c.answers.map((a) => [a.stepId, a.answer]);
const skipButton = () =>
  Array.from(win.document.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith("Skip"),
  );

describe("the step the attached files answer", () => {
  it("is not claimed by a typed answer (scenario A)", () => {
    const done: Completion[] = [];
    const old = file("old.png");
    const logo = file("logo.png");
    mountLog(panel(card([COMPANY, LOGO], done)));
    attach([old]);
    type("Acme");
    click(sendButton());

    click(byLabel("Remove old.png")[0]);
    attach([logo]);
    assert.equal(sendButton().disabled, false);
    pressEnter();
    assert.equal(done.length, 1);
    assert.deepEqual(pairs(done[0]), [
      ["q-company", "Acme"],
      ["q-logo", "See attached"],
    ]);
    assert.deepEqual(done[0].files, [logo]);
  });

  it("is released when its files are no longer all attached", () => {
    const done: Completion[] = [];
    const old = file("old.png");
    const logo = file("logo.png");
    mountLog(panel(card([OPEN, LOGO], done)));
    attach([old]);
    click(sendButton());
    assert.equal(sendButton().disabled, true);

    click(byLabel("Remove old.png")[0]);
    attach([logo]);
    assert.equal(sendButton().disabled, false);
  });

  it("is released when the user goes back and skips it (scenario B)", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    mountLog(panel(card([OPEN, LOGO], done)));
    attach([photo]);
    click(sendButton());
    click(byLabel("Back")[0]);
    click(skipButton());

    assert.equal(sendButton().disabled, false);
    click(sendButton());
    assert.deepEqual(pairs(done[0]), [["q-logo", "See attached"]]);
    assert.deepEqual(done[0].files, [photo]);
  });

  it("is released when its answer is replaced by a typed one", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    mountLog(panel(card([OPEN, LOGO], done)));
    attach([photo]);
    click(sendButton());
    click(byLabel("Back")[0]);
    type("No image after all");
    click(sendButton());

    assert.equal(sendButton().disabled, false);
    click(sendButton());
    assert.deepEqual(pairs(done[0]), [
      ["q-image", "No image after all"],
      ["q-logo", "See attached"],
    ]);
  });

  it("holds when the claimed step is re-sent with its files answer", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    mountLog(panel(card([OPEN, LOGO], done)));
    attach([photo]);
    click(sendButton());
    click(byLabel("Back")[0]);
    click(sendButton());
    assert.equal(sendButton().disabled, true);
  });

  it("survives parking the card and restoring it", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    let parked: StepperState | undefined;
    const onStateChange = (s: StepperState) => {
      parked = s;
    };
    const { render } = mountLog(
      panel(card([OPEN, LOGO], done, { onStateChange })),
    );
    attach([photo]);
    click(sendButton());
    render(panel(null));
    render(panel(card([OPEN, LOGO], done, { state: parked, onStateChange })));
    assert.equal(chips("photo.png"), 1);
    assert.equal(sendButton().disabled, true);
  });
});

describe("one completion at a time", () => {
  it("drops a second report that lands before the card rerenders", () => {
    const done: Completion[] = [];
    const pending = deferred();
    mountLog(
      panel(
        card([PICK, CONNECT], done, {
          result: () => pending.promise,
          renderConnect: (_step, api) =>
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  api.onConnected();
                  api.onConnected();
                },
              },
              "Done",
            ),
        }),
      ),
    );
    attach([file("photo.png")]);
    const fox = Array.from(win.document.querySelectorAll('[role="radio"]'))[0];
    click(fox);
    const connected = Array.from(win.document.querySelectorAll("button")).find(
      (b) => b.textContent === "Done",
    );
    click(connected);
    assert.equal(done.length, 1);
  });
});

describe("the composer's send", () => {
  it("releases only the files it sent", async () => {
    const pending = deferred();
    const photo = file("photo.png");
    const doc = file("doc.pdf", "application/pdf");
    mountLog(panel(null, { onSend: () => pending.promise }));
    attach([photo]);
    type("Here it is");
    const submit = win.document.querySelector(
      '[data-composer-submit="true"]',
    ) as HTMLButtonElement;
    click(submit);
    attach([doc]);
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    await flush();
    assert.equal(chips("photo.png"), 0);
    assert.equal(chips("doc.pdf"), 1);
  });
});
