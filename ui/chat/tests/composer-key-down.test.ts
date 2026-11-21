import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DictationControl } from "../src/dictation-types.ts";
import { useComposerKeyDown } from "../src/use-composer-key-down.ts";

type Opts = Parameters<typeof useComposerKeyDown>[0];
type Handler = ReturnType<typeof useComposerKeyDown>;

function handlerFor(opts: Opts): Handler {
  let captured: Handler | undefined;
  function Probe() {
    captured = useComposerKeyDown(opts);
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  if (!captured) throw new Error("hook did not run");
  return captured;
}

function escapeKey(): { e: never; prevented: () => boolean } {
  let prevented = false;
  const e = {
    key: "Escape",
    get defaultPrevented() {
      return prevented;
    },
    preventDefault: () => {
      prevented = true;
    },
  };
  return { e: e as never, prevented: () => prevented };
}

const capture = (onCancel: () => void) =>
  ({ state: "recording", onCancel }) as unknown as DictationControl;

describe("composer Escape", () => {
  it("cancels a dictation capture before it stops the turn", () => {
    let cancelled = 0;
    let stopped = 0;
    const handle = handlerFor({
      mentionKeyDown: () => undefined,
      dictation: capture(() => cancelled++),
      status: "streaming",
      onStop: () => stopped++,
    });
    const { e, prevented } = escapeKey();
    handle(e);
    assert.equal(cancelled, 1);
    assert.equal(stopped, 0);
    assert.ok(prevented());
  });

  it("stops a running turn when nothing else claims Escape", () => {
    let stopped = 0;
    const handle = handlerFor({
      mentionKeyDown: () => undefined,
      status: "streaming",
      onStop: () => stopped++,
    });
    handle(escapeKey().e);
    assert.equal(stopped, 1);
  });

  it("leaves Escape to the mention list when it consumes it", () => {
    let stopped = 0;
    const handle = handlerFor({
      mentionKeyDown: (e) => e.preventDefault(),
      status: "streaming",
      onStop: () => stopped++,
    });
    handle(escapeKey().e);
    assert.equal(stopped, 0);
  });
});
