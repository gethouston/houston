import type { LinkedInPostResult } from "@houston/engine-adapter";
import { linkedInPostLink } from "@houston/sdk/linkedin/policy";
import {
  type LinkedInPostClaim,
  useLinkedInPosts,
} from "./linkedin-post-store";

export type LinkedInPostOutcome =
  | { kind: "posted"; postUrl: string }
  | { kind: "unconfirmed" }
  | Extract<LinkedInPostResult, { kind: "refused" }>
  | { kind: "failed" };

export interface LinkedInPostSteps {
  signedIn: () => string | null;
  prepare: () => Promise<Blob>;
  send: (image: Blob) => Promise<LinkedInPostResult>;
}

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
    return mine() ? { kind: "failed" } : null;
  } finally {
    posts.ended(claim);
  }
}

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
