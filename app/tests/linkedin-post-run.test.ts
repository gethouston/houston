import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import type { LinkedInPostResult } from "@houston/engine-adapter";
import {
  type LinkedInPostSteps,
  runLinkedInPost,
} from "../src/components/organization/linkedin-post-run.ts";
import {
  IDLE_LINKEDIN_POST,
  type LinkedInPostClaim,
  linkedInPostKey,
  useLinkedInPosts,
} from "../src/components/organization/linkedin-post-store.ts";

const postUrl = "https://www.linkedin.com/feed/update/urn:li:share:7/";
const POSTED: LinkedInPostResult = { kind: "posted", postUrn: "u", postUrl };
const ada = linkedInPostKey("uid-ada", "space-a");
const slot = () => useLinkedInPosts.getState().slots[ada] ?? IDLE_LINKEDIN_POST;

function claim(): LinkedInPostClaim {
  const held = useLinkedInPosts.getState().start("uid-ada", "space-a");
  if (!held) throw new Error("the slot was taken");
  return held;
}

/** A post whose steps settle when the test says, signed in as `who.uid`. */
function steps(result: LinkedInPostResult = POSTED) {
  const who = { uid: "uid-ada" as string | null };
  const sent: Blob[] = [];
  let encoded = (_: Blob) => {};
  let answer = (_: LinkedInPostResult) => {};
  const run: LinkedInPostSteps = {
    signedIn: () => who.uid,
    prepare: () =>
      new Promise((resolve) => {
        encoded = resolve;
      }),
    send: (image) => {
      sent.push(image);
      return new Promise((resolve) => {
        answer = resolve;
      });
    },
  };
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    who,
    sent,
    run,
    encode: async () => {
      encoded(new Blob(["jpeg"]));
      await tick();
    },
    answer: async () => {
      answer(result);
      await tick();
    },
  };
}

afterEach(() => useLinkedInPosts.setState({ slots: {} }));

describe("a LinkedIn post across identities", () => {
  it("applies the result for the person who posted", async () => {
    const post = steps();
    const outcome = runLinkedInPost(claim(), post.run);
    await post.encode();
    await post.answer();
    deepStrictEqual(await outcome, { kind: "posted", postUrl });
    deepStrictEqual(slot(), { ...IDLE_LINKEDIN_POST, landed: postUrl });
  });

  it("keeps Posting and applies the result when the same person signs back in", async () => {
    const post = steps({ kind: "unknown" });
    const outcome = runLinkedInPost(claim(), post.run);
    await post.encode();
    // Signed out and back in while the gateway still works.
    post.who.uid = null;
    useLinkedInPosts.getState().reset();
    post.who.uid = "uid-ada";
    useLinkedInPosts.getState().reset();
    strictEqual(slot().posting, true);
    strictEqual(useLinkedInPosts.getState().start("uid-ada", "space-a"), null);
    await post.answer();
    deepStrictEqual(await outcome, { kind: "unconfirmed" });
    deepStrictEqual(slot(), { ...IDLE_LINKEDIN_POST, unconfirmed: true });
  });

  it("keeps the result in its person's slot, unsaid, when someone else signed in", async () => {
    const post = steps();
    const outcome = runLinkedInPost(claim(), post.run);
    await post.encode();
    useLinkedInPosts.getState().reset();
    post.who.uid = "uid-grace";
    await post.answer();
    strictEqual(await outcome, null);
    deepStrictEqual(slot(), { ...IDLE_LINKEDIN_POST, landed: postUrl });
    const grace = linkedInPostKey("uid-grace", "space-a");
    strictEqual(useLinkedInPosts.getState().slots[grace], undefined);
  });

  it("holds Post for its person when a post that may be up settles while they are out", async () => {
    const post = steps({ kind: "unknown" });
    const outcome = runLinkedInPost(claim(), post.run);
    await post.encode();
    post.who.uid = null;
    useLinkedInPosts.getState().reset();
    await post.answer();
    strictEqual(await outcome, null);
    deepStrictEqual(slot(), { ...IDLE_LINKEDIN_POST, unconfirmed: true });
    // Back in: still held until they say they checked.
    useLinkedInPosts.getState().reset();
    strictEqual(useLinkedInPosts.getState().start("uid-ada", "space-a"), null);
  });

  it("sends nothing when the person signed out while the picture encoded", async () => {
    const post = steps();
    const outcome = runLinkedInPost(claim(), post.run);
    post.who.uid = null;
    useLinkedInPosts.getState().reset();
    await post.encode();
    strictEqual(await outcome, null);
    strictEqual(post.sent.length, 0);
    deepStrictEqual(slot(), IDLE_LINKEDIN_POST);
  });

  it("says a failed step to its person, and frees the slot", async () => {
    const outcome = runLinkedInPost(claim(), {
      signedIn: () => "uid-ada",
      prepare: () => Promise.reject(new Error("encode")),
      send: () => Promise.resolve(POSTED),
    });
    deepStrictEqual(await outcome, { kind: "failed" });
    deepStrictEqual(slot(), IDLE_LINKEDIN_POST);
  });
});
