import { Plus, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { STORE_VIEW_ID } from "../store-view";
import { CreateChoiceTile } from "./create-choice-tile";

interface AgentPickerStepProps {
  /** Starts the from-scratch path (naming step) with the blank config. */
  onCreateBlank: () => void;
}

/**
 * Step 1 of the create-agent dialog: exactly two ways to get an agent, drawn
 * as the same square choice tiles the sidebar's create chooser uses — this
 * screen is the direct continuation of that one. Installing a ready-made agent
 * happens on the Agent Store page (free listings, its own install pipeline),
 * so that tile closes the dialog and navigates there instead of embedding a
 * catalog grid in the modal (PRODUCT-1171).
 */
export function AgentPickerStep({ onCreateBlank }: AgentPickerStepProps) {
  const { t } = useTranslation("shell");
  const setCreateOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div className="grid grid-cols-2 gap-3 px-6 pb-6 pt-1">
      <CreateChoiceTile
        icon={Store}
        title={t("newAgent.storeCard")}
        onClick={() => {
          setCreateOpen(false);
          setViewMode(STORE_VIEW_ID);
        }}
      />
      <CreateChoiceTile
        icon={Plus}
        title={t("newAgent.createCard")}
        onClick={onCreateBlank}
      />
    </div>
  );
}
