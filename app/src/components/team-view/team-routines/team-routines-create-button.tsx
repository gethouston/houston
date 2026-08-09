import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

export function TeamRoutinesCreateButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("teams");
  // The team strip's lozenge height and a full radius, the same capsule the
  // board's "New task" wears: the right zone is one row of them, and this is
  // the section's one filled control.
  return (
    <Button size="sm" className="gap-1.5 rounded-full" onClick={onClick}>
      <Plus className="size-4" />
      {t("teamView.routines.newRoutine")}
    </Button>
  );
}
