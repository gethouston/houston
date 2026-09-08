import { ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient, isHoustonEngineError } from "../src/client.ts";

/**
 * A client-generated activity id (the optimistic composer send and the warming
 * queue both mint one) can land on an id another mission already holds. The
 * host refuses that with `409 { code: "activity_exists" }` rather than letting
 * the second mission take the first one's card over.
 *
 * The client must REJECT it. A create that resolves on a conflict would hand
 * the caller a mission id belonging to someone else's card: the turn would be
 * stamped onto the wrong row, and the user would never be told.
 */

const CONFLICT = {
  error: "a different mission already has that id",
  code: "activity_exists",
};

function client(onFetch: () => void) {
  return new HoustonClient({
    baseUrl: "http://127.0.0.1:1111",
    token: "t",
    retry: { baseDelayMs: 1, maxDelayMs: 1, deadlineMs: 5_000, maxAttempts: 5 },
    fetchImpl: async () => {
      onFetch();
      return new Response(JSON.stringify(CONFLICT), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    },
  });
}

describe("createActivity on a taken id", () => {
  it("rejects with the host's status instead of resolving", async () => {
    let calls = 0;
    await rejects(
      () =>
        client(() => {
          calls += 1;
        }).createActivity("Work/Ada", {
          id: "m1",
          title: "Someone else's mission",
        }),
      (err: unknown) => {
        ok(isHoustonEngineError(err));
        strictEqual(err.status, 409);
        // The TS host answers a bare-string body, so the typed `.code` getter
        // sees nothing — the STATUS is what callers classify on
        // (`app/src/lib/agent-gone.ts`), and 409 is neither gone nor
        // unreadable, so it keeps the loud surface.
        strictEqual(err.code, undefined);
        return true;
      },
    );
    // A mutating POST is never replayed: a retry of a conflict is a second
    // chance to steal the same card.
    strictEqual(calls, 1);
  });
});
