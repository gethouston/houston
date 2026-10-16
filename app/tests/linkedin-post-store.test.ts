import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  IDLE_LINKEDIN_POST,
  isPostHeld,
  type LinkedInPostClaim,
  linkedInPostKey,
  useLinkedInPosts,
} from "../src/components/organization/linkedin-post-store.ts";

const url = "https://www.linkedin.com/feed/update/urn:li:share:7/";
const ada = linkedInPostKey("uid-ada", "space-a");
const slot = (key: string) =>
  useLinkedInPosts.getState().slots[key] ?? IDLE_LINKEDIN_POST;
const claim = (uid = "uid-ada", space = "space-a"): LinkedInPostClaim => {
  const held = useLinkedInPosts.getState().start(uid, space);
  if (!held) throw new Error("the slot was taken");
  return held;
};

afterEach(() => useLinkedInPosts.setState({ slots: {} }));

// The org chart page unmounts and remounts around the store, which is all a
// navigation away and back does to it: the slot is the only post state.
describe("a person's LinkedIn post slot in a space", () => {
  it("refuses a second post while one from the slot is out", () => {
    const posts = useLinkedInPosts.getState();
    claim();
    // The page came back while the gateway still works: still Posting.
    strictEqual(slot(ada).posting, true);
    strictEqual(posts.start("uid-ada", "space-a"), null);
    // Another space posts its own chart.
    strictEqual(posts.start("uid-ada", "space-b") !== null, true);
  });

  it("holds a post that went up with no dialog open until one shows it", () => {
    const posts = useLinkedInPosts.getState();
    const held = claim();
    posts.posted(held, url);
    posts.ended(held);
    deepStrictEqual(slot(ada), { ...IDLE_LINKEDIN_POST, landed: url });
    posts.shown(ada);
    deepStrictEqual(slot(ada), IDLE_LINKEDIN_POST);
  });

  it("holds Post after no answer in time until the person checked", () => {
    const posts = useLinkedInPosts.getState();
    const held = claim();
    posts.unconfirmed(held);
    posts.ended(held);
    deepStrictEqual(slot(ada), { ...IDLE_LINKEDIN_POST, unconfirmed: true });
    strictEqual(isPostHeld(slot(ada)), true);
    // Showing it in an opening is not checking LinkedIn.
    posts.shown(ada);
    strictEqual(isPostHeld(slot(ada)), true);
    strictEqual(posts.start("uid-ada", "space-a"), null);
    posts.dismissUnconfirmed(ada);
    strictEqual(isPostHeld(slot(ada)), false);
    strictEqual(posts.start("uid-ada", "space-a") !== null, true);
  });

  it("frees the slot when a post did not go up", () => {
    const posts = useLinkedInPosts.getState();
    posts.ended(claim());
    deepStrictEqual(slot(ada), IDLE_LINKEDIN_POST);
    strictEqual(posts.start("uid-ada", "space-a") !== null, true);
  });

  // Every account's personal space is "default".
  it("keeps two people apart in a space with the same id", () => {
    const grace = linkedInPostKey("uid-grace", "default");
    claim("uid-ada", "default");
    deepStrictEqual(slot(grace), IDLE_LINKEDIN_POST);
    strictEqual(
      useLinkedInPosts.getState().start("uid-grace", "default") !== null,
      true,
    );
  });

  it("is held by the person who claimed it, whenever they are signed in", () => {
    const posts = useLinkedInPosts.getState();
    const held = claim();
    strictEqual(posts.holds(held, "uid-ada"), true);
    strictEqual(posts.holds(held, "uid-grace"), false);
    strictEqual(posts.holds(held, null), false);
  });
});

describe("an identity change", () => {
  it("clears every slot with no post out or held", () => {
    const posts = useLinkedInPosts.getState();
    const b = claim("uid-ada", "space-b");
    posts.posted(b, url);
    posts.reset();
    deepStrictEqual(useLinkedInPosts.getState().slots, {});
  });

  it("keeps a post that may be up held, so its person checks before Post", () => {
    const posts = useLinkedInPosts.getState();
    const c = claim("uid-ada", "space-c");
    posts.unconfirmed(c);
    posts.reset();
    const held = linkedInPostKey("uid-ada", "space-c");
    deepStrictEqual(useLinkedInPosts.getState().slots, {
      [held]: { ...IDLE_LINKEDIN_POST, unconfirmed: true },
    });
    strictEqual(posts.start("uid-ada", "space-c"), null);
  });

  it("keeps a post still out Posting, so its person never posts twice", () => {
    const posts = useLinkedInPosts.getState();
    const held = claim();
    posts.reset();
    deepStrictEqual(slot(ada), { ...IDLE_LINKEDIN_POST, posting: true });
    // The same person signed back in: still Posting, no second Post.
    strictEqual(posts.start("uid-ada", "space-a"), null);
    strictEqual(posts.holds(held, "uid-ada"), true);
  });
});
