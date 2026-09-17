import { rejects, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import { channelLinkExpired } from "../src/lib/channel-link-expiry.ts";
import { createChannelScope } from "../src/lib/channel-scope.ts";

describe("channel action scope", () => {
  it("aborts a late operation after switching away and back", () => {
    let identity = "user-a:space-a";
    let notify = () => {};
    let closed = false;
    const scope = createChannelScope(
      () => identity,
      (listener) => {
        notify = listener;
        return () => {
          closed = true;
        };
      },
    );
    scope.assertCurrent();
    identity = "user-a:space-b";
    notify();
    identity = "user-a:space-a";
    notify();
    strictEqual(scope.current(), false);
    strictEqual(scope.signal.aborted, true);
    throws(() => scope.assertCurrent(), { name: "AbortError" });
    scope.close();
    strictEqual(closed, true);
  });
  it("fences account changes and ignores unrelated cache notifications", () => {
    let identity = "user-a:personal";
    let notify = () => {};
    const scope = createChannelScope(
      () => identity,
      (listener) => {
        notify = listener;
        return () => {};
      },
    );
    notify();
    strictEqual(scope.current(), true);
    identity = "user-b:personal";
    notify();
    strictEqual(scope.signal.aborted, true);
    scope.close();
  });
});

describe("channel pairing expiration", () => {
  it("expires precisely at the deadline, including after device sleep", () => {
    const deadline = "2026-09-08T13:00:00Z";
    const at = Date.parse(deadline);
    strictEqual(channelLinkExpired(deadline, at - 1), false);
    strictEqual(channelLinkExpired(deadline, at), true);
    strictEqual(channelLinkExpired(deadline, at + 60_000), true);
    strictEqual(channelLinkExpired("invalid", at), true);
  });
});

it("rejects a late OAuth handoff before its external opener can run", async () => {
  let identity = "personal";
  let notify = () => {};
  const scope = createChannelScope(
    () => identity,
    (listener) => {
      notify = listener;
      return () => {};
    },
  );
  let resolveUrl: (url: string) => void = () => {};
  const response = new Promise<string>((resolve) => {
    resolveUrl = resolve;
  });
  let opened = false;
  const pending = response.then(() => {
    scope.assertCurrent();
    opened = true;
  });
  identity = "team";
  notify();
  resolveUrl("https://slack.com/oauth/v2/authorize");
  await rejects(pending, { name: "AbortError" });
  strictEqual(opened, false);
  scope.close();
});
