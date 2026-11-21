import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../../hooks/use-org-write-lock";

export function TeamRoutinesCreateButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("teams");
  const { locked } = useOrgWriteLock();
  return (
    <Button
      size="sm"
      className="gap-1.5 rounded-full"
      disabled={locked}
      onClick={onClick}
    >
      <Plus className="size-4" />
      {t("teamView.routines.newRoutine")}
    </Button>
  );
}
