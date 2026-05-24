/**
 * `<FocusedAssistantPane />` — the right pane mounted by the chat tab
 * when `advanced.tile_layout` is on. Sticks the most recent assistant
 * text from the active session into a larger, scrollable reader so the
 * user can read long answers without losing their place in the chat
 * scroll.
 *
 * Phase 6 of RFC #248. v1 only renders text — markdown / code-blocks /
 * tool-call cards stay in the chat panel. v2 may add a richer renderer
 * with pinning, multi-message scrubbing, etc.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FeedItem } from "@houston-ai/chat";

interface Props {
  feedItems: FeedItem[];
}

export function FocusedAssistantPane({ feedItems }: Props) {
  const { t } = useTranslation("tile");
  const latest = useMemo(() => latestAssistantText(feedItems), [feedItems]);

  if (!latest) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-1">
        <h3 className="text-sm font-semibold">{t("focus.emptyTitle")}</h3>
        <p className="text-xs text-muted-foreground max-w-sm">
          {t("focus.emptyDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        {t("focus.heading")}
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
        {latest}
      </div>
    </div>
  );
}

function latestAssistantText(items: FeedItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (
      item.feed_type === "assistant_text" ||
      item.feed_type === "assistant_text_streaming"
    ) {
      const text = item.data;
      if (typeof text === "string" && text.trim().length > 0) {
        return text;
      }
    }
  }
  return null;
}
