import type { CitationAnchor, SentCitation } from "@houston/wire-types";

/** At most this many comments ride one message: past it the agent's reading
 *  turns into skimming, and the crops weigh on the upload. */
export const CITATION_LIMIT = 10;

/** A comment pinned to a region of a previewed file, waiting in a draft. */
export interface DraftCitation {
  id: string;
  /** Workspace-relative path of the commented file. */
  filePath: string;
  fileName: string;
  /** 1-based page (slide) the comment sits on. */
  page: number;
  /** The file's page count when the comment was made. */
  pageCount: number;
  anchor: CitationAnchor;
  comment: string;
  /** PNG crop of the region, base64 without a `data:` prefix. */
  cropBase64: string;
  /** The file was rewritten and this page no longer exists. */
  detached: boolean;
}

/** What a surface hands `add`: the comment minus what the module assigns. */
export type NewCitation = Omit<DraftCitation, "id" | "detached">;

export type AddCitationResult =
  | { ok: true; citation: DraftCitation }
  | { ok: false; reason: "limit_reached"; limit: number };

/** A sent message with its citations lifted out for rendering. */
export interface DecodedCitations {
  /** The message without the citations envelope. */
  text: string;
  citations: SentCitation[];
}
