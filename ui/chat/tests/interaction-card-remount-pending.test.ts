// A completion still uploading when the user
// leaves the conversation stays pending for the card that returns. The
// remounted card's restored connect step completes again on mount; that must
// not send the same answer and files a second time.

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

/** Reports an already-connected app once, on mount, like the app's connect
 *  card, and records whether the card handed it a disabled chrome. */
function AlreadyConnected({ api, seen }: { api: ConnectApi; seen: boolean[] }) {
  seen.push(api.disabled);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- This fixture connects once on mount; later card updates must not repeat the connection.
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

    // Away to another conversation and back before the upload settles.
    render(panel(null, { sessionKey: "b", attachments: [] }));
    seen.length = 0;
    render(panel(restored(), { sessionKey: "a", attachments: [photo] }));
    assert.equal(done.length, 1, "the returning card sent the reply again");
    assert.equal(seen.at(-1), true, "the returning card is not disabled");

    // A refused send frees the card for a retry.
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
