import type { ChatCompactionInfo } from "@houston-ai/chat";
import { useTranslation } from "react-i18next";
import { getProvider } from "../lib/providers";

interface ContextCompactedDividerProps {
  info: ChatCompactionInfo;
}

/**
 * Subtle divider marking a conversation boundary. Two kinds:
 *
 *  - `compacted` — the context was compacted (the provider auto-compacted, or
 *    Houston proactively summarized + reseeded to free space).
 *  - `provider_switch` — the user switched the conversation to a different
 *    provider; the new provider continued with the full conversation carried
 *    over (`summarized: false`) or a summary of it (`summarized: true`).
 *
 * The full chat above and below stays visible; this just marks the boundary.
 * Rendered by the app's `renderSystemMessage` for `msg.compaction` items so the
 * label is localized (the `ui/chat` library keeps an English default).
 */
export function ContextCompactedDivider({
  info,
}: ContextCompactedDividerProps) {
  const { t } = useTranslation("chat");

  let label: string;
  if (info.kind === "provider_switch") {
    const provider =
      getProvider(info.provider ?? "")?.name ?? info.provider ?? "";
    label = t(
      info.summarized
        ? "providerSwitch.dividerSummary"
        : "providerSwitch.dividerFull",
      { provider },
    );
  } else {
    label = t("contextCompacted");
  }

  return (
    <div className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3 text-muted-foreground/70">
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-xs italic whitespace-nowrap">{label}</span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}
