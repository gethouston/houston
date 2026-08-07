import type { LucideIcon } from "lucide-react";
import { PencilLine, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { STORE_VIEW_ID } from "../store-view";

interface AgentPickerStepProps {
  /** Starts the from-scratch path (naming step) with the blank config. */
  onCreateBlank: () => void;
}

/**
 * Step 1 of the create-agent dialog: exactly two ways to get an agent.
 * Installing a ready-made agent happens on the Agent Store page (free
 * listings, its own install pipeline), so that card closes the dialog and
 * navigates there instead of embedding a catalog grid in the modal
 * (PRODUCT-1171).
 */
export function AgentPickerStep({ onCreateBlank }: AgentPickerStepProps) {
  const { t } = useTranslation("shell");
  const setCreateOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div className="flex flex-col gap-3 px-6 pb-6 pt-1">
      <ChoiceCard
        icon={Store}
        title={t("newAgent.storeCard")}
        description={t("newAgent.storeCardDescription")}
        onClick={() => {
          setCreateOpen(false);
          setViewMode(STORE_VIEW_ID);
        }}
      />
      <ChoiceCard
        icon={PencilLine}
        title={t("newAgent.createCard")}
        description={t("newAgent.createCardDescription")}
        onClick={onCreateBlank}
      />
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ht-hairline flex items-center gap-4 rounded-xl bg-card p-5 text-left transition duration-200 hover:bg-hover active:scale-[0.98]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs leading-relaxed text-ink-muted">
          {description}
        </span>
      </span>
    </button>
  );
}
