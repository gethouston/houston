import { afterEach, describe, expect, it } from "vitest";
import { runLinkedInPost } from "../../../app/src/components/organization/linkedin-post-run";
import {
  IDLE_LINKEDIN_POST,
  linkedInPostKey,
  useLinkedInPosts,
} from "../../../app/src/components/organization/linkedin-post-store";
import { resetForIdentityChange } from "../../../app/src/lib/identity-reset";

const url = "https://www.linkedin.com/feed/update/urn:li:share:7/";
const slots = () => useLinkedInPosts.getState().slots;

afterEach(() => useLinkedInPosts.setState({ slots: {} }));

// The sign-out and account-switch paths both run resetForIdentityChange.
describe("a LinkedIn post through resetForIdentityChange", () => {
  it("drops the outgoing person's settled posts", () => {
    const posts = useLinkedInPosts.getState();
    const claim = posts.start("uid-ada", "space-b");
    if (!claim) throw new Error("the slot was taken");
    posts.posted(claim, url);
    resetForIdentityChange();
    expect(slots()).toEqual({});
  });

  it("settles a post still out into its own person's hold, never the next person's", async () => {
    const claim = useLinkedInPosts.getState().start("uid-ada", "space-a");
    if (!claim) throw new Error("the slot was taken");
    let answer = (_: { kind: "unknown" }) => {};
    let signedIn: string | null = "uid-ada";
    const outcome = runLinkedInPost(claim, {
      signedIn: () => signedIn,
      prepare: async () => new Blob(["jpeg"]),
      send: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    await new Promise((r) => setTimeout(r, 0));
    resetForIdentityChange();
    signedIn = "uid-grace";
    answer({ kind: "unknown" });
    await expect(outcome).resolves.toBeNull();
    expect(slots()[linkedInPostKey("uid-ada", "space-a")]).toEqual({
      ...IDLE_LINKEDIN_POST,
      unconfirmed: true,
    });
    expect(slots()[linkedInPostKey("uid-grace", "space-a")]).toBeUndefined();
  });
});
