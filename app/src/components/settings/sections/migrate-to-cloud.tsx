import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useMigrateToCloudStore } from "../../../stores/migrate-to-cloud";

/**
 * Settings entry for the legacy→cloud upgrade: explains what the migration
 * is and reopens the launch modal, which owns the actual install flow. Kept
 * deliberately thin — one offer surface (the modal), several ways in.
 */
export function MigrateToCloudSection() {
  const { t } = useTranslation("settings");
  const open = useMigrateToCloudStore((s) => s.open);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">
        {t("migrateToCloud.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("migrateToCloud.description")}
      </p>
      <Button className="rounded-full" onClick={() => open("settings")}>
        {t("migrateToCloud.button")}
      </Button>
    </section>
  );
}
