import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type CardProps,
  type Completion,
  card,
  deferred,
  file,
  flush,
  mountLog,
  OPEN,
  panel,
  type Step,
} from "./support/card-attachments-harness.ts";

const { createElement: h, useEffect } = await import("react");

type ConnectApi = Parameters<CardProps["renderConnect"]>[1];

const CONNECT: Step = { kind: "connect", id: "c-gmail", toolkit: "gmail" };

function AlreadyConnected({ api, seen }: { api: ConnectApi; seen: boolean[] }) {
  seen.push(api.disabled);
  useEffect(() => api.onConnected(), []);
  return null;
}

describe("question card completion across a remount", () => {
  it("keeps a pending send pending for the card that returns", async () => {
    const done: Completion[] = [];
    let pending = deferred();
    const seen: boolean[] = [];
    const photo = file("photo.png");
    const restored = () =>
      card([OPEN, CONNECT], done, {
        completionKey: "conv-a:interaction-1",
        state: {
          current: 1,
          reached: 1,
          answers: { "q-image": { answer: "Here", optionId: null } },
          drafts: {},
        },
        result: () => pending.promise,
        renderConnect: (_step, api) => h(AlreadyConnected, { api, seen }),
      });
    const { render } = mountLog(
      panel(restored(), { sessionKey: "a", attachments: [photo] }),
    );
    assert.equal(done.length, 1);
    assert.deepEqual(done[0].files, [photo]);

    render(panel(null, { sessionKey: "b", attachments: [] }));
    seen.length = 0;
    render(panel(restored(), { sessionKey: "a", attachments: [photo] }));
    assert.equal(done.length, 1, "the returning card sent the reply again");
    assert.equal(seen.at(-1), true, "the returning card is not disabled");

    pending.resolve(false);
    await flush();
    assert.equal(seen.at(-1), false);

    pending = deferred();
    render(panel(null, { sessionKey: "b", attachments: [] }));
    render(panel(restored(), { sessionKey: "a", attachments: [photo] }));
    assert.equal(done.length, 2);
    assert.deepEqual(done[1].files, [photo]);
    pending.resolve(true);
    await flush();
    assert.equal(seen.at(-1), false);
  });

  it("does not hold back a different interaction's card", async () => {
    const done: Completion[] = [];
    const pending = deferred();
    const seen: boolean[] = [];
    const restored = (completionKey: string) =>
      card([OPEN, CONNECT], done, {
        completionKey,
        state: {
          current: 1,
          reached: 1,
          answers: { "q-image": { answer: "Here", optionId: null } },
          drafts: {},
        },
        result: () => pending.promise,
        renderConnect: (_step, api) => h(AlreadyConnected, { api, seen }),
      });
    const { render } = mountLog(panel(restored("conv-a:one")));
    render(panel(null));
    render(panel(restored("conv-a:two")));
    assert.equal(done.length, 2);
    pending.resolve(true);
    await flush();
  });
});
