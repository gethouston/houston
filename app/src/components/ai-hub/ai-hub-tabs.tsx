import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type HubTab = "providers" | "models";

/**
 * The segmented pill switch between the provider marketplace and the model
 * directory. The Models tab carries the live catalog count ("Models · 438").
 * Presentational: the hub view owns which tab is active.
 */
export function AiHubTabs({
  active,
  modelCount,
  onSelect,
}: {
  active: HubTab;
  modelCount: number;
  onSelect: (tab: HubTab) => void;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <div
      role="tablist"
      aria-label={t("hero.title")}
      className="inline-flex self-start gap-1 rounded-full bg-secondary p-1"
    >
      <Tab
        selected={active === "providers"}
        onClick={() => onSelect("providers")}
      >
        {t("tabs.providers")}
      </Tab>
      <Tab selected={active === "models"} onClick={() => onSelect("models")}>
        {t("tabs.modelsCount", { count: modelCount })}
      </Tab>
    </div>
  );
}

function Tab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`h-8 rounded-full px-4 text-sm font-medium transition-colors ${
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
