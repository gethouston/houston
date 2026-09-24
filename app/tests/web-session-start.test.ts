// The web surface's launch beat (`lib/web-session-start.ts`). The live wiring
// — `analytics.track` and the visitor capture — is injected in
// packages/web/src/app-tree.tsx, so the rule itself is driven here.
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createWebSessionStart } from "../src/lib/web-session-start.ts";

const VISITOR = "2b0f7a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c";

function harness() {
  const tracked: string[] = [];
  const order: string[] = [];
  let captures = 0;
  const start = createWebSessionStart({
    track: (name) => {
      order.push("track");
      tracked.push(name);
    },
    captureVisitor: () => {
      order.push("capture");
      captures += 1;
      return VISITOR;
    },
  });
  return { start, tracked, order, captures: () => captures };
}

describe("the web app's launch beat", () => {
  it("announces the session on the bus the sink listens to", () => {
    const h = harness();
    h.start();
    deepStrictEqual(h.tracked, ["session_started"]);
  });

  it("captures the visitor id before the first event exists", () => {
    // The event is what forces a batch; the id is what that batch must carry,
    // so it has to be in hand first.
    const h = harness();
    h.start();
    deepStrictEqual(h.order, ["capture", "track"]);
  });

  it("fires once, however often the tree remounts it", () => {
    const h = harness();
    h.start();
    h.start();
    h.start();
    deepStrictEqual(h.tracked, ["session_started"]);
    strictEqual(h.captures(), 1);
  });
});
