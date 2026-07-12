import { Badge, cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type HubTab = "providers" | "models" | "policy";

/**
 * The Providers / Models switch, rendered as the SAME underline tab strip the
 * per-agent pages use (`@houston-ai/layout` TabBar). TabBar bakes in its own
 * page-chrome (outer `px-5 pt-4` + title/actions row) which would misalign the
 * tabs from the hub's centered column, so this thin adapter mirrors TabBar's
 * tab-strip markup verbatim — identical `gap-5`, `pb-2.5 text-sm`, active
 * `font-medium` + `h-[2px] bg-action` underline, muted hover — minus that
 * chrome. Keep the two visually in sync. Both tabs carry their live count
 * beside the label as a secondary count {@link Badge} (the same treatment the
 * agent-admin sidebar uses), not baked into the label string.
 */
export function AiHubTabs({
  active,
  providerCount,
  modelCount,
  showPolicy,
  onSelect,
}: {
  active: HubTab;
  providerCount: number;
  modelCount: number;
  /** Teams owner/admin only: the workspace model-policy tab (no count badge). */
  showPolicy: boolean;
  onSelect: (tab: HubTab) => void;
}) {
  const { t } = useTranslation("aiHub");
  const tabs: { id: HubTab; label: string; count?: number }[] = [
    { id: "providers", label: t("tabs.providers"), count: providerCount },
    { id: "models", label: t("tabs.models"), count: modelCount },
    ...(showPolicy ? [{ id: "policy" as const, label: t("tabs.policy") }] : []),
  ];
  return (
    <div
      role="tablist"
      aria-label={t("hero.title")}
      className="flex items-center gap-5"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            type="button"
            role="tab"
            key={tab.id}
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-sm pb-2.5 text-sm transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              isActive
                ? "text-ink font-medium"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <Badge
                variant="secondary"
                className="min-w-5 px-1.5 font-normal tabular-nums text-ink-muted"
              >
                {tab.count}
              </Badge>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-action" />
            )}
          </button>
        );
      })}
    </div>
  );
}
