import type {
  LinkedInConnection,
  LinkedInConnectReturn,
  LinkedInRefusalCode,
} from "@houston/wire-types";

export type { LinkedInConnection, LinkedInConnectReturn, LinkedInRefusalCode };

export interface LinkedInConnectAnswer {
  url: string;
  accepted: LinkedInConnectReturn["kind"] | null;
}

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

export interface LinkedInPostInput {
  image: Blob;
  text: string;
  altText?: string;
  signal?: AbortSignal;
}

export type LinkedInPostResult =
  | { kind: "posted"; postUrn: string | null; postUrl: string | null }
  | {
      kind: "refused";
      code: LinkedInRefusalCode;
      retryAfterMs?: number;
    }
  | { kind: "unknown" };
