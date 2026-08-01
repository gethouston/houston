import { Button } from "@houston-ai/core";
import { FlagIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StoreReportDialog } from "./store-report-dialog";

export function StoreDetailFooter({
  slug,
  detailFailed,
}: {
  slug: string;
  detailFailed: boolean;
}) {
  const { t } = useTranslation("store");
  const [open, setOpen] = useState(false);
  return (
    <footer className="flex flex-col items-start gap-3">
      {detailFailed ? (
        <p className="text-sm text-danger">{t("detail.loadFailed")}</p>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-ink-muted"
      >
        <FlagIcon className="size-4" />
        {t("report.open")}
      </Button>
      <StoreReportDialog slug={slug} open={open} onOpenChange={setOpen} />
    </footer>
  );
}
