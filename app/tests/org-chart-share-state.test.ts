import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  IDLE_LINKEDIN_POST,
  isPostHeld,
  linkedInPostKey,
  useLinkedInPosts,
} from "../src/components/organization/linkedin-post-store.ts";
import type { ShareLine } from "../src/components/organization/org-chart-share-run.ts";
import {
  INITIAL_SHARE_DIALOG,
  replacesShownImage,
  type ShareDialogAction,
  shareDialogReducer,
} from "../src/components/organization/org-chart-share-state.ts";

const COPIED: ShareLine = { kind: "copied" };
const run = (...actions: ShareDialogAction[]) =>
  actions.reduce(shareDialogReducer, INITIAL_SHARE_DIALOG);

describe("shareDialogReducer", () => {
  it("says where the picture went for a share started in this opening", () => {
    const open = run({ type: "open" });
    const landed = shareDialogReducer(open, {
      type: "landed",
      session: open.session,
      line: COPIED,
    });
    deepStrictEqual(landed.line, COPIED);
  });

  it("drops a share's line once the dialog was closed and opened again", () => {
    const first = run({ type: "open" });
    const reopened = run({ type: "open" }, { type: "close" }, { type: "open" });
    const landed = shareDialogReducer(reopened, {
      type: "landed",
      session: first.session,
      line: COPIED,
    });
    strictEqual(landed.line, null);
  });

  it("starts each opening with no line and Copy image unflipped", () => {
    const busy = run(
      { type: "open" },
      { type: "landed", session: 1, line: COPIED },
      { type: "copied" },
    );
    strictEqual(busy.copied, true);
    const reopened = run(
      { type: "open" },
      { type: "landed", session: 1, line: COPIED },
      { type: "copied" },
      { type: "close" },
      { type: "open" },
    );
    strictEqual(reopened.line, null);
    strictEqual(reopened.copied, false);
    strictEqual(reopened.open, true);
  });

  it("forgets the line and the Copied flip when the image is redrawn", () => {
    const redrawn = run(
      { type: "open" },
      { type: "landed", session: 1, line: COPIED },
      { type: "copied" },
      { type: "redrawn", url: "blob:new" },
    );
    strictEqual(redrawn.line, null);
    strictEqual(redrawn.copied, false);
    strictEqual(redrawn.open, true);
  });

  it("treats only a replaced picture as a redraw, not the first image", () => {
    strictEqual(replacesShownImage(null, "blob:first"), false);
    strictEqual(replacesShownImage("blob:a", "blob:a"), false);
    strictEqual(replacesShownImage("blob:a", null), true);
    strictEqual(replacesShownImage("blob:a", "blob:b"), true);
  });

  it("flips Copied back after its moment", () => {
    strictEqual(run({ type: "copied" }, { type: "copiedDone" }).copied, false);
  });

  it("keeps the person's words until the next opening", () => {
    const edited = run({ type: "open" }, { type: "edited", text: "Mine" });
    strictEqual(edited.text, "Mine");
    strictEqual(
      shareDialogReducer(edited, { type: "redrawn", url: null }).text,
      "Mine",
    );
    strictEqual(
      run(
        { type: "open" },
        { type: "edited", text: "x" },
        { type: "close" },
        { type: "open" },
      ).text,
      null,
    );
  });

  it("ties a connect to its opening and attempt, dropping stale results", () => {
    const watch = { until: 600_000 };
    const open = run({ type: "open" });
    const tag = { session: open.session, attempt: 1 };
    const minting = shareDialogReducer(open, {
      type: "connecting",
      ...tag,
      watch,
    });
    deepStrictEqual(minting.connect, { id: 1, minting: true, watch });
    const waiting = shareDialogReducer(minting, {
      type: "connectOpened",
      ...tag,
    });
    strictEqual(waiting.connect?.minting, false);
    // Started over: attempt 2 replaces 1, whose late results change nothing.
    const restarted = shareDialogReducer(waiting, {
      type: "connecting",
      session: open.session,
      attempt: 2,
      watch,
    });
    strictEqual(
      shareDialogReducer(restarted, { type: "connectEnded", ...tag }),
      restarted,
    );
    strictEqual(
      shareDialogReducer(restarted, { type: "connectOpened", ...tag }),
      restarted,
    );
    strictEqual(
      shareDialogReducer(restarted, {
        type: "connectEnded",
        session: open.session,
        attempt: 2,
      }).connect,
      null,
    );
  });

  it("drops a connect from an earlier opening, and ends it on close", () => {
    const watch = { until: 600_000 };
    const first = run(
      { type: "open" },
      {
        type: "connecting",
        session: 1,
        attempt: 1,
        watch,
      },
    );
    strictEqual(shareDialogReducer(first, { type: "close" }).connect, null);
    const reopened = run(
      { type: "open" },
      { type: "connecting", session: 1, attempt: 1, watch },
      { type: "close" },
      { type: "open" },
      { type: "connecting", session: 2, attempt: 2, watch },
    );
    const stale = shareDialogReducer(reopened, {
      type: "connectEnded",
      session: 1,
      attempt: 1,
      line: { kind: "blocked", url: "https://x.test", channel: null },
    });
    strictEqual(stale, reopened);
    // A connect started after the dialog closed lands nowhere.
    const closed = run({ type: "open" }, { type: "close" });
    strictEqual(
      shareDialogReducer(closed, {
        type: "connecting",
        session: 1,
        attempt: 3,
        watch,
      }).connect,
      null,
    );
  });

  it("lands a post in the opening on screen, and nowhere while closed", () => {
    const url = "https://www.linkedin.com/feed/update/urn:li:share:7/";
    const posted = run(
      { type: "open" },
      { type: "posting" },
      { type: "posted", postUrl: url },
    );
    strictEqual(posted.postUrl, url);
    deepStrictEqual(posted.line, { kind: "posted" });
    // Closed: the space's post slot holds the link for the next opening.
    const closed = run({ type: "open" }, { type: "close" });
    strictEqual(
      shareDialogReducer(closed, { type: "posted", postUrl: url }),
      closed,
    );
    const after = [{ type: "close" }, { type: "open" }] as const;
    strictEqual(after.reduce(shareDialogReducer, posted).postUrl, null);
  });

  it("says why a post was refused, in whichever opening is on screen", () => {
    const refused = run(
      { type: "open" },
      { type: "posting" },
      { type: "close" },
      { type: "open" },
      { type: "postRefused", line: { kind: "reconnect" } },
    );
    deepStrictEqual(refused.line, { kind: "reconnect" });
    strictEqual(refused.postUrl, null);
  });
});

describe("a post with no answer in time", () => {
  const unconfirmed = () =>
    run({ type: "open" }, { type: "posting" }, { type: "postUnconfirmed" });

  it("says it may be up", () => {
    const state = unconfirmed();
    deepStrictEqual(state.line, { kind: "unconfirmed" });
    strictEqual(state.postUrl, null);
  });

  it("keeps saying so through a redrawn picture", () => {
    const redrawn = shareDialogReducer(unconfirmed(), {
      type: "redrawn",
      url: "blob:next",
    });
    deepStrictEqual(redrawn.line, { kind: "unconfirmed" });
  });

  it("drops the line once the person dismisses it", () => {
    const dismissed = shareDialogReducer(unconfirmed(), {
      type: "unconfirmedDismissed",
    });
    strictEqual(dismissed.line, null);
  });

  // Closing, reopening or leaving the page is not checking LinkedIn.
  it("holds Post in the next opening, until the person checked", () => {
    const key = linkedInPostKey("uid-ada", "space-a");
    const posts = useLinkedInPosts.getState();
    const claim = posts.start("uid-ada", "space-a");
    if (!claim) throw new Error("the slot was taken");
    posts.unconfirmed(claim);
    posts.ended(claim);
    // The dialog's own state starts over in each opening; the slot does not.
    const reopened = run({ type: "close" }, { type: "open" });
    strictEqual(reopened.line, null);
    const slot = () =>
      useLinkedInPosts.getState().slots[key] ?? IDLE_LINKEDIN_POST;
    strictEqual(isPostHeld(slot()), true);
    posts.dismissUnconfirmed(key);
    strictEqual(isPostHeld(slot()), false);
  });

  it("never dismisses another line", () => {
    const refused = run(
      { type: "open" },
      { type: "postRefused", line: { kind: "retry" } },
      { type: "unconfirmedDismissed" },
    );
    deepStrictEqual(refused.line, { kind: "retry" });
  });

  it("says nothing with the dialog closed", () => {
    const closed = run({ type: "postUnconfirmed" });
    strictEqual(closed.line, null);
  });
});
