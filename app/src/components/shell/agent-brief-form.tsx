import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

interface AgentBriefFormProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// The example briefs that pre-fill the textarea. Keys map to
// `aiAssist.examples.*` translation entries.
const EXAMPLE_KEYS = ["sales", "inbox", "reports", "research"] as const;

export function AgentBriefForm({
  value,
  onChange,
  disabled,
}: AgentBriefFormProps) {
  const { t } = useTranslation("shell");

  return (
    <div className="space-y-3">
      <label
        htmlFor="agent-brief"
        className="block text-sm font-medium text-ink"
      >
        {t("aiAssist.briefLabel")}
      </label>
      <textarea
        id="agent-brief"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("aiAssist.briefPlaceholder")}
        rows={6}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-3 text-sm text-ink leading-relaxed",
          "placeholder:text-ink-muted/60",
          "bg-chip border border-ink/[0.04] rounded-xl",
          "outline-none resize-none transition-shadow duration-200",
          "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        )}
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">
          {t("aiAssist.examplesLabel")}
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  t(`aiAssist.examples.${key}` as Parameters<typeof t>[0]),
                )
              }
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                "border-line bg-chip hover:bg-hover text-ink",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {t(`aiAssist.examples.${key}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
