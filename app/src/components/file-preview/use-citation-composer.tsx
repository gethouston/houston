import { CitationChipRow } from "@houston-ai/chat";
import { type ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fileNameOf } from "../../lib/agent-file-paths";
import { citationsFacade } from "../../lib/citations-facade";
import { showSendFailedToast } from "../../lib/send-error-toast";
import { useCitationFocus } from "../../stores/citation-focus";
import { useUIStore } from "../../stores/ui";
import { draftChip, pageName } from "./citation-labels";
import type { CitedText } from "./cited-submit";
import { useDraftCitations } from "./use-draft-citations";

/**
 * The composer's side of file comments for one chat: the chip row its header
 * shows, and the submit step that folds the comments into the message. Every
 * composer send runs through `prepare` (the board's submit interceptor), so no
 * send path can leave the comments behind. They leave the draft while the
 * send is out and come back unless the engine accepts it.
 */
export function useCitationComposer(
  agentPath: string | null,
  draftKey: string,
): {
  count: number;
  header: ReactNode;
  prepare: (text: string) => Promise<CitedText | null>;
} {
  const { t } = useTranslation("agents");
  const citations = useDraftCitations(draftKey);
  const hotId = useCitationFocus((s) => s.hotId);
  const setHot = useCitationFocus((s) => s.setHot);
  const requestReveal = useCitationFocus((s) => s.requestReveal);
  const preview = useUIStore((s) => s.filePreview);
  const setFilePreview = useUIStore((s) => s.setFilePreview);

  const open = useCallback(
    (id: string) => {
      const c = citations.find((x) => x.id === id);
      if (!c || !agentPath) return;
      requestReveal(id);
      if (
        preview?.filePath === c.filePath &&
        preview.chat?.draftKey === draftKey
      )
        return;
      setFilePreview({
        agentPath,
        filePath: c.filePath,
        fileName: fileNameOf(c.filePath),
        chat: { draftKey },
        page: c.page,
      });
    },
    [citations, agentPath, draftKey, preview, requestReveal, setFilePreview],
  );

  const header = useMemo(() => {
    if (citations.length === 0) return null;
    const chips = citations.map((c, i) => draftChip(t, c, i + 1));
    return (
      <CitationChipRow
        chips={chips}
        hotId={hotId}
        onHot={setHot}
        onOpen={open}
        onRemove={(id) => citationsFacade.module().remove(draftKey, id)}
        labels={{
          region: t("files.preview.comments.row"),
          noComment: t("files.preview.comments.noComment"),
          open: (chip) =>
            t("files.preview.comments.chipOpen", {
              n: chip.n,
              where: pageName(
                t,
                citations[chip.n - 1]?.fileName ?? "",
                citations[chip.n - 1]?.page ?? 1,
              ),
              comment: chip.comment || t("files.preview.comments.noComment"),
            }),
          remove: (chip) =>
            t("files.preview.comments.chipRemove", { n: chip.n }),
        }}
      />
    );
  }, [citations, hotId, setHot, open, draftKey, t]);

  const prepare = useCallback(
    async (text: string) => {
      if (!agentPath || citationsFacade.module().list(draftKey).length === 0)
        return null;
      try {
        const cited = await citationsFacade.compose(agentPath, draftKey, text);
        return {
          text: cited,
          onUnsent: () => citationsFacade.module().release(cited),
        };
      } catch (error) {
        // The crops never reached the workspace: nothing was sent, and the
        // comments are back in the draft for a retry.
        showSendFailedToast(error);
        throw error;
      }
    },
    [agentPath, draftKey],
  );

  return { count: citations.length, header, prepare };
}
