import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The global page's Custom skills tab (HOU-792): the same sources the
 * per-agent tab offers — build one with an agent (primary) or add one
 * manually (the multi-agent from-scratch dialog).
 */
export function GlobalCustomTab({
  onCreateWithAi,
  onAddClick,
}: {
  /** Start the create-with-AI chat (agent picked first when several). */
  onCreateWithAi: () => void;
  /** Open the manual from-scratch dialog (multi-agent). */
  onAddClick: () => void;
}) {
  const { t } = useTranslation("skills");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {t("tabs.customEmptyDescription")}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={onCreateWithAi}>
          {t("tabs.createSkill")}
        </Button>
        <Button type="button" variant="outline" onClick={onAddClick}>
          <Plus className="size-4" />
          {t("grid.addSkill")}
        </Button>
      </div>
    </div>
  );
}
