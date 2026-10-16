import type { LinkedInPostResult } from "@houston/engine-adapter";
import { linkedInPostLink } from "@houston/sdk/linkedin/policy";
import {
  type LinkedInPostClaim,
  useLinkedInPosts,
} from "./linkedin-post-store";

/** How a post settled, for the person who made it. */
export type LinkedInPostOutcome =
  | { kind: "posted"; postUrl: string }
  | { kind: "unconfirmed" }
  | Extract<LinkedInPostResult, { kind: "refused" }>
  /** The picture or the post failed; each step reported its own failure. */
  | { kind: "failed" };

export interface LinkedInPostSteps {
  /** Who is signed in now (`null`: nobody, a local desktop). */
  signedIn: () => string | null;
  /** The picture to post. Reports its own failure before rejecting. */
  prepare: () => Promise<Blob>;
  /** Sends it. Reports its own failure before rejecting. */
  send: (image: Blob) => Promise<LinkedInPostResult>;
}

/**
 * One claimed post, from the picture to its result in the slot. A post
 * prepared under one identity is never sent under another. Its result always
 * lands in its person's slot, so a post that may be up still holds Post when
 * they sign back in; it is said (the outcome) only while they are signed in,
 * and is `null` otherwise, so nothing of it reaches the next person. The slot
 * stops Posting either way.
 */
export async function runLinkedInPost(
  claim: LinkedInPostClaim,
  steps: LinkedInPostSteps,
): Promise<LinkedInPostOutcome | null> {
  const posts = useLinkedInPosts.getState();
  const mine = () => posts.holds(claim, steps.signedIn());
  try {
    const image = await steps.prepare();
    if (!mine()) return null;
    const outcome = settled(claim, await steps.send(image));
    return mine() ? outcome : null;
  } catch {
    // Already reported by the step that failed (see LinkedInPostSteps).
    return mine() ? { kind: "failed" } : null;
  } finally {
    posts.ended(claim);
  }
}

/** Records `result` in the claim's own slot (keyed by its person). */
function settled(
  claim: LinkedInPostClaim,
  result: LinkedInPostResult,
): LinkedInPostOutcome {
  const posts = useLinkedInPosts.getState();
  if (result.kind === "unknown") {
    posts.unconfirmed(claim);
    return { kind: "unconfirmed" };
  }
  if (result.kind === "refused") return result;
  const postUrl = linkedInPostLink(result.postUrl);
  posts.posted(claim, postUrl);
  return { kind: "posted", postUrl };
}
