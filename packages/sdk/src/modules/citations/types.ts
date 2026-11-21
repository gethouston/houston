import type { CitationAnchor, SentCitation } from "@houston/wire-types";

export const CITATION_LIMIT = 10;

export interface DraftCitation {
  id: string;
  filePath: string;
  fileName: string;
  page: number;
  pageCount: number;
  anchor: CitationAnchor;
  comment: string;
  cropBase64: string;
  detached: boolean;
}

export type NewCitation = Omit<DraftCitation, "id" | "detached"> & {
  sharpCrop?: Promise<string>;
};

export type AddCitationResult =
  | { ok: true; citation: DraftCitation }
  | { ok: false; reason: "limit_reached"; limit: number };

export interface DecodedCitations {
  text: string;
  citations: SentCitation[];
}
