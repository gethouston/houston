import { reportStoreAgent } from "@houston-ai/engine-client";
import { ReportDialog } from "./report-dialog";

/**
 * The abuse-report form for a store listing — opened from the detail dialog's
 * quiet "Report" affordance. A thin binding of the shared {@link ReportDialog}
 * to `POST /agents/{slug}/reports` through the anonymous catalog client.
 */
export function StoreReportDialog({
  slug,
  open,
  onOpenChange,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ReportDialog
      open={open}
      onOpenChange={onOpenChange}
      errorScope="store_report"
      onSubmit={(input) => reportStoreAgent(slug, input)}
    />
  );
}
