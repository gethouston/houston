import type { DraftCitation } from "@houston/sdk";
import { useSdkSnapshot } from "@houston/sdk/react";
import { citationsFacade } from "../../lib/citations-facade";

const NONE: readonly DraftCitation[] = [];

/** A composer draft's file comments, live. Empty without a draft. */
export function useDraftCitations(
  draftKey: string | null,
): readonly DraftCitation[] {
  const source = citationsFacade.source();
  const scope = draftKey ? source.citations.scope(draftKey) : "citations/-";
  return useSdkSnapshot<readonly DraftCitation[]>(source, scope) ?? NONE;
}
