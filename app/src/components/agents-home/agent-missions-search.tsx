import { Input } from "@houston-ai/core";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * The task list's inline search field, revealed from the "…" menu and closed
 * by its own control or Escape. It takes focus on reveal — the user asked for
 * it by name, so the keyboard coming up is the point, not a surprise.
 */
export function AgentMissionsSearch({
  query,
  onQuery,
  onClose,
}: {
  query: string;
  onQuery: (query: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("shell");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
      <Input
        ref={field}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        placeholder={t("agentsHome.searchPlaceholder")}
        aria-label={t("agentsHome.searchPlaceholder")}
        data-testid="agent-missions-search"
        className="text-base"
      />
      <button
        type="button"
        aria-label={t("agentsHome.searchClose")}
        data-testid="agent-missions-search-close"
        onClick={onClose}
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <X aria-hidden className="size-5" />
      </button>
    </div>
  );
}
