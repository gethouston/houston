import type { ChatCompactionInfo } from "@houston-ai/chat";
import { useTranslation } from "react-i18next";
import { providerName } from "../lib/providers";

interface ContextCompactedDividerProps {
  info: ChatCompactionInfo;
}

/**
 * Subtle divider marking a conversation boundary. Three kinds:
 *
 *  - `compacted` — the context was compacted, either because it was filling up
 *    (the provider auto-compacted, or Houston summarized + reseeded) or because
 *    the user asked for it with `/compact` (`trigger: "manual"`).
 *  - `provider_switch` — the user switched the conversation to a different
 *    provider; the new provider continued with the full conversation carried
 *    over (`summarized: false`) or a summary of it (`summarized: true`).
 *  - `context_cleared` — the user asked to start fresh with `/clear`: from here
 *    on the agent remembers nothing above, and says so, because a silent
 *    divider would read as an unexplained gap in its memory.
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
    const provider = providerName(info.provider ?? "");
    label = t(
      info.summarized
        ? "providerSwitch.dividerSummary"
        : "providerSwitch.dividerFull",
      { provider },
    );
  } else if (info.kind === "context_cleared") {
    label = t("contextCleared");
  } else {
    label = t(
      info.trigger === "manual" ? "contextCompactedManual" : "contextCompacted",
    );
  }

  return (
    <div className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3 text-ink-muted/70">
      <div className="h-px flex-1 bg-line/60" />
      {/* The cleared line is a full sentence, so it wraps on a phone rather
          than pushing the rules off-screen; the short ones never wrap. */}
      <span className="text-xs italic text-center md:whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-line/60" />
    </div>
  );
}
