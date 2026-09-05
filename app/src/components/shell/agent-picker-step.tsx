import { Copy, Plus, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { STORE_VIEW_ID } from "../store-view";
import { tutorialAnchor } from "../tutorial";
import { CreateChoiceTile } from "./create-choice-tile";

interface AgentPickerStepProps {
  /** Starts the from-scratch path (naming step) with the blank config. */
  onCreateBlank: () => void;
  /** Starts the copy path; absent when there is no agent to copy from. */
  onCopyExisting?: () => void;
}

/**
 * Step 1 of the create-agent dialog: the ways to get an agent, drawn as the
 * same choice tiles the sidebar's create chooser uses — this screen is the
 * direct continuation of that one. Installing a ready-made agent happens on
 * the Agent Store page (free listings, its own install pipeline), so that tile
 * closes the dialog and navigates there instead of embedding a catalog grid
 * in the modal (PRODUCT-1171). "Copy an agent" models the new one on an
 * existing agent, item by item, and only exists once there is one to copy.
 */
export function AgentPickerStep({
  onCreateBlank,
  onCopyExisting,
}: AgentPickerStepProps) {
  const { t } = useTranslation("shell");
  const setCreateOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);
  // The in-app onboarding teaches ONE path: while it runs, "Create new" is
  // the only live tile — the store detour or the copy wizard would drop the
  // user out of the lesson.
  const tutorialActive = useUIStore((s) => s.inAppOnboardingActive);

  return (
    <div
      className={
        onCopyExisting
          ? "grid grid-cols-1 gap-3 px-6 pb-6 pt-1 md:grid-cols-3"
          : "grid grid-cols-1 gap-3 px-6 pb-6 pt-1 md:grid-cols-2"
      }
    >
      <CreateChoiceTile
        icon={Store}
        title={t("newAgent.storeCard")}
        disabled={tutorialActive}
        onClick={() => {
          setCreateOpen(false);
          setViewMode(STORE_VIEW_ID);
        }}
      />
      <CreateChoiceTile
        icon={Plus}
        title={t("newAgent.createCard")}
        onClick={onCreateBlank}
        dataAttrs={tutorialAnchor("createAgentBlankTile")}
      />
      {onCopyExisting && (
        <CreateChoiceTile
          icon={Copy}
          title={t("newAgent.copyCard")}
          disabled={tutorialActive}
          onClick={onCopyExisting}
        />
      )}
    </div>
  );
}
