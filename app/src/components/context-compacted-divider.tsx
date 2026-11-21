import type { ChatCompactionInfo } from "@houston-ai/chat";
import { useTranslation } from "react-i18next";
import { providerName } from "../lib/providers";

interface ContextCompactedDividerProps {
  info: ChatCompactionInfo;
}

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
      <span className="text-xs italic text-center md:whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-line/60" />
    </div>
  );
}
