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
  option,
  PICK,
  panel,
  pressEnter,
  type Step,
  sendButton,
  type,
} from "./support/card-attachments-harness.ts";

const { createElement: h, useEffect } = await import("react");

type ConnectApi = Parameters<CardProps["renderConnect"]>[1];

const CONNECT: Step = { kind: "connect", id: "c-gmail", toolkit: "gmail" };
const CONTRACT: Step = {
  kind: "question",
  id: "q-contract",
  question: "Send me the contract",
};
const COMPANY: Step = {
  kind: "question",
  id: "q-company",
  question: "What is your company name?",
};

function AlreadyConnected({ api }: { api: ConnectApi }) {
  useEffect(() => api.onConnected(), []);
  return null;
}

describe("question card completion with files", () => {
  it("keeps the files when the send fails, and sends them on the retry", async () => {
    const done: Completion[] = [];
    let pending = deferred();
    const photo = file("photo.png");
    mountLog(panel(card([OPEN], done, { result: () => pending.promise })));
    attach([photo]);

    click(sendButton());
    assert.deepEqual(done[0].files, [photo]);
    pending.resolve(false);
    await flush();
    assert.equal(chips("photo.png"), 1);

    pending = deferred();
    click(sendButton());
    assert.equal(done.length, 2);
    assert.equal(done[1].answers[0].answer, "See attached");
    assert.deepEqual(done[1].files, [photo]);
    pending.resolve(true);
    await flush();
    assert.equal(chips("photo.png"), 0);
  });

  it("takes one completion while the send is in flight", async () => {
    const done: Completion[] = [];
    const pending = deferred();
    const photo = file("photo.png");
    mountLog(panel(card([PICK], done, { result: () => pending.promise })));
    attach([photo]);

    click(option("The fox"));
    click(option("The owl"));
    click(sendButton());
    assert.equal(done.length, 1);
    assert.equal(sendButton().disabled, true);
    assert.equal((option("The owl") as HTMLButtonElement).disabled, true);

    const doc = file("doc.pdf", "application/pdf");
    attach([doc]);
    pending.resolve(true);
    await flush();
    assert.equal(chips("photo.png"), 0);
    assert.equal(chips("doc.pdf"), 1);
  });

  it("keeps the files on a connect-only completion", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    const { render } = mountLog(panel(null));
    attach([photo]);
    render(
      panel(
        card([CONNECT], done, {
          renderConnect: (_step, api) =>
            h("button", { type: "button", onClick: api.onConnected }, "Done"),
        }),
      ),
    );
    const connected = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Done",
    );
    click(connected);
    assert.deepEqual(done, [{ answers: [], files: [] }]);
    render(panel(null));
    assert.equal(chips("photo.png"), 1);
  });

  it("keeps the files when the card is skipped", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    mountLog(panel(card([OPEN], done), { attachments: [photo] }));
    const skip = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Skip"),
    );
    click(skip);
    assert.deepEqual(done, [{ answers: [], files: [] }]);
    assert.equal(chips("photo.png"), 1);
  });

  it("hands the files over when a restored last step completes on mount", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    mountLog(
      panel(
        card([OPEN, CONNECT], done, {
          state: {
            current: 1,
            reached: 1,
            answers: { "q-image": { answer: "Here", optionId: null } },
            drafts: {},
          },
          renderConnect: (_step, api) => h(AlreadyConnected, { api }),
        }),
        { attachments: [photo] },
      ),
    );
    assert.equal(done.length, 1);
    assert.deepEqual(done[0].files, [photo]);
  });

  it("scopes the attachments to the conversation they were added in", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    const { render } = mountLog(panel(null, { sessionKey: "a" }));
    attach([photo]);
    assert.equal(chips("photo.png"), 1);

    render(panel(card([PICK], done), { sessionKey: "b" }));
    assert.equal(chips("photo.png"), 0);
    click(option("The fox"));
    assert.deepEqual(done[0].files, []);

    render(panel(null, { sessionKey: "a" }));
    assert.equal(chips("photo.png"), 1);
  });

  it("lets files answer only the step they were sent from", () => {
    const done: Completion[] = [];
    const contract = file("contract.pdf", "application/pdf");
    mountLog(panel(card([CONTRACT, COMPANY], done)));
    attach([contract]);

    click(sendButton());
    assert.equal(byLabel("Send").length, 1);
    assert.equal(sendButton().disabled, true);
    pressEnter();
    assert.equal(done.length, 0);

    type("Acme");
    click(sendButton());
    assert.deepEqual(
      done[0].answers.map((a) => [a.stepId, a.answer]),
      [
        ["q-contract", "See attached"],
        ["q-company", "Acme"],
      ],
    );
    assert.deepEqual(done[0].files, [contract]);
  });

  it("re-confirms a revisited step's picked option instead of the files", () => {
    const done: Completion[] = [];
    const photo = file("photo.png");
    mountLog(panel(card([PICK, OPEN], done), { attachments: [photo] }));
    click(option("The fox"));
    click(byLabel("Back")[0]);
    assert.equal(sendButton().disabled, true);
    pressEnter();
    click(sendButton());
    assert.deepEqual(
      done[0].answers.map((a) => [a.stepId, a.answer, a.source]),
      [
        ["q-photo", "The fox", "option"],
        ["q-image", "See attached", "text"],
      ],
    );
  });
});
