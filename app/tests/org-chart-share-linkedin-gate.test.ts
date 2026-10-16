// A click while a LinkedIn share runs, or within a second of one, is dropped
// (a double click opened two composers), and the gate survives a task that
// throws or rejects.

import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import {
  createLinkedInGate,
  LINKEDIN_OPEN_COOLDOWN_MS,
} from "../src/components/organization/org-chart-share-gate.ts";

/** A clock the test moves by hand. */
function clock() {
  let at = 10_000;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

/** The next event turn: every microtask of the last one has run. */
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLinkedInGate", () => {
  it("opens once for a double click in two event turns, even when the open settles at once", async () => {
    const time = clock();
    const gate = createLinkedInGate(time.now);
    const opened: number[] = [];
    const click = (n: number) =>
      gate(() => {
        opened.push(n);
        return Promise.resolve();
      });
    strictEqual(click(1), true);
    deepStrictEqual(opened, [1]);
    await nextTurn();
    time.advance(50);
    strictEqual(click(2), false);
    await nextTurn();
    time.advance(LINKEDIN_OPEN_COOLDOWN_MS - 51);
    strictEqual(click(3), false);
    await nextTurn();
    time.advance(1);
    strictEqual(click(4), true);
    deepStrictEqual(opened, [1, 4]);
  });

  it("drops clicks while a share runs, and counts the cooldown from when it settles", async () => {
    const time = clock();
    const gate = createLinkedInGate(time.now);
    let finish!: () => void;
    const started: number[] = [];
    gate(() => {
      started.push(1);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    time.advance(5 * LINKEDIN_OPEN_COOLDOWN_MS);
    strictEqual(
      gate(async () => {
        started.push(2);
      }),
      false,
    );
    finish();
    await nextTurn();
    strictEqual(
      gate(async () => {
        started.push(3);
      }),
      false,
    );
    time.advance(LINKEDIN_OPEN_COOLDOWN_MS);
    strictEqual(
      gate(() => {
        started.push(4);
        return Promise.reject(new Error("x"));
      }),
      true,
    );
    await nextTurn();
    time.advance(LINKEDIN_OPEN_COOLDOWN_MS);
    strictEqual(
      gate(async () => {
        started.push(5);
      }),
      true,
    );
    deepStrictEqual(started, [1, 4, 5]);
  });

  it("releases and rethrows when the task throws before returning a promise", () => {
    const time = clock();
    const gate = createLinkedInGate(time.now);
    throws(
      () =>
        gate(() => {
          throw new URIError("URI malformed");
        }),
      URIError,
    );
    time.advance(LINKEDIN_OPEN_COOLDOWN_MS);
    strictEqual(
      gate(async () => {}),
      true,
    );
  });
});
