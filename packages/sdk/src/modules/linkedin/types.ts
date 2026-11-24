import type {
  LinkedInConnection,
  LinkedInConnectReturn,
  LinkedInRefusalCode,
} from "@houston/wire-types";

export type { LinkedInConnection, LinkedInConnectReturn, LinkedInRefusalCode };

/** LinkedIn's page, and the return the gateway took (`null`: the web app). */
export interface LinkedInConnectAnswer {
  url: string;
  accepted: LinkedInConnectReturn["kind"] | null;
}

/** A redeemed ticket: the connection it made, or one that never will. */
export type LinkedInCompletion =
  | {
      kind: "connected";
      connection: Extract<LinkedInConnection, { connected: true }>;
    }
  | { kind: "invalid" };

export const LinkedInCommand = {
  Connection: "linkedin/connection",
  Connect: "linkedin/connect",
  Complete: "linkedin/complete",
  Disconnect: "linkedin/disconnect",
  PostImage: "linkedin/postImage",
} as const;

export type LinkedInCommandType =
  (typeof LinkedInCommand)[keyof typeof LinkedInCommand];

/** What `postImage` takes. */
export interface LinkedInPostInput {
  /** The picture, a PNG or a JPEG. */
  image: Blob;
  /** The post's words, as the person left them. */
  text: string;
  /** What the picture shows, for people who cannot see it. */
  altText?: string;
  /** Aborts the post; it then rejects with the signal's reason. */
  signal?: AbortSignal;
}

/**
 * A post either went up (`postUrl` is LinkedIn's page for it, `null` when
 * LinkedIn gave no readable id: it is up all the same), was refused with a
 * typed code, or is `unknown`: it may be up (no answer in time, a connection
 * cut after the request left, a proxy's bare 502 or 504). Only an answer that
 * is none of these (a 500) throws.
 */
export type LinkedInPostResult =
  | { kind: "posted"; postUrn: string | null; postUrl: string | null }
  | {
      kind: "refused";
      code: LinkedInRefusalCode;
      /** The 429's `Retry-After`, when it carried a readable one. */
      retryAfterMs?: number;
    }
  | { kind: "unknown" };
