import { MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

export type HintKind = "pointer" | "touch" | "noChat";

/**
 * The bars that float over the bottom of the pages, one at a time: the
 * one-time "how to comment" hint, the phone's "comment this selection" (the
 * native text handles own the gesture there), and "N comments ready · Back to
 * chat" whenever the chat is out of sight.
 */
export function PreviewFloatBars({
  hint,
  onHintDone,
  touchSelection,
  onCommentSelection,
  ready,
  onReady,
}: {
  hint: HintKind | null;
  onHintDone: () => void;
  touchSelection: boolean;
  onCommentSelection: () => void;
  /** Comments waiting in the draft, shown only while the chat is hidden. */
  ready: number;
  onReady: () => void;
}) {
  const { t } = useTranslation("agents");
  if (touchSelection)
    return (
      <button
        type="button"
        onClick={onCommentSelection}
        className="preview-float preview-press h-11 gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-text shadow-drag"
      >
        <MessageSquarePlus className="size-4" aria-hidden />
        {t("files.preview.comments.commentSelection")}
      </button>
    );
  if (ready > 0)
    return (
      <button
        type="button"
        onClick={onReady}
        className="preview-float preview-press h-11 gap-2 rounded-full bg-action px-4.5 text-sm font-medium whitespace-nowrap text-action-text shadow-drag"
      >
        {t("files.preview.comments.ready", { count: ready })}
        <span aria-hidden className="opacity-50">
          ·
        </span>
        {t("files.preview.comments.backToChat")}
      </button>
    );
  if (!hint) return null;
  return (
    <div
      role="note"
      className="preview-float gap-2.5 rounded-[20px] bg-popover py-1.5 pr-1.5 pl-3.5 text-[13px] text-hover-text shadow-raised ring-1 ring-line"
    >
      <MessageSquarePlus className="size-4 shrink-0 text-ink" aria-hidden />
      <span className="min-w-0 leading-snug">
        {hint === "noChat"
          ? t("files.preview.comments.hintNoChat")
          : hint === "touch"
            ? t("files.preview.comments.hintTouch")
            : t("files.preview.comments.hint")}
      </span>
      <button
        type="button"
        onClick={onHintDone}
        className="preview-press h-7.5 shrink-0 rounded-full bg-chip-solid px-3 text-[13px] font-medium whitespace-nowrap text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {t("files.preview.comments.hintOk")}
      </button>
    </div>
  );
}
