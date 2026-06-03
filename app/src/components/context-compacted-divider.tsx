import { useTranslation } from "react-i18next";

/**
 * Subtle divider shown where a conversation's context was compacted (the
 * provider auto-compacted, or Houston proactively summarized + reseeded). The
 * full chat above and below stays visible; this just marks the boundary.
 * Rendered by the app's `renderSystemMessage` for `msg.compaction` items so
 * the label is localized (the `ui/chat` library keeps an English default).
 */
export function ContextCompactedDivider() {
  const { t } = useTranslation("chat");
  return (
    <div className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3 text-muted-foreground/70">
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-xs italic whitespace-nowrap">
        {t("contextCompacted")}
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}
