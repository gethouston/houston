import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from "@houston-ai/core";
import type { ReportReason } from "@houston-ai/engine-client";
import { reportStoreAgent } from "@houston-ai/engine-client";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

/** The moderation vocabulary the gateway accepts (`POST /agents/{slug}/reports`). */
const REPORT_REASONS: ReportReason[] = [
  "spam",
  "malicious",
  "impersonation",
  "inappropriate",
  "other",
];
/** Gateway caps: `details` <= 2000 chars, `contact` <= 320 chars. */
const MAX_DETAILS = 2000;
const MAX_CONTACT = 320;

/**
 * The abuse-report form for a store listing — opened from the detail dialog's
 * quiet "Report" affordance. Anonymous: a reason is required, free-text details
 * and a follow-up contact are optional and NEVER prefilled from the session
 * (the report goes to moderation, not the account). Submission routes through
 * the anonymous catalog client; the gateway rate-limits at 5/min/IP.
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
  const { t } = useTranslation("store");
  const addToast = useUIStore((s) => s.addToast);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const reasonId = useId();
  const detailsId = useId();
  const contactId = useId();

  const reset = () => {
    setReason("spam");
    setDetails("");
    setContact("");
  };

  /**
   * Closing the dialog (Cancel, overlay, Escape, X, or a successful submit)
   * always clears the form. The state lives on this component, which stays
   * mounted across opens, so without this a reopen would show the previous
   * report's reason/details/contact — including free text about another agent.
   */
  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    setPending(true);
    try {
      await reportStoreAgent(slug, {
        reason,
        details: details.trim() || undefined,
        contact: contact.trim() || undefined,
      });
      addToast({ title: t("report.success"), variant: "success" });
      handleOpenChange(false);
    } catch (err) {
      reportError(
        "store_report",
        err instanceof Error ? err.message : String(err),
        err,
      );
      addToast({ title: t("report.failed"), variant: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("report.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium text-ink">
              {t("report.reasonLabel")}
            </label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as ReportReason)}
              disabled={pending}
            >
              <SelectTrigger id={reasonId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`report.reason.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={detailsId} className="text-sm font-medium text-ink">
              {t("report.detailsLabel")}
            </label>
            <Textarea
              id={detailsId}
              value={details}
              maxLength={MAX_DETAILS}
              rows={4}
              placeholder={t("report.detailsPlaceholder")}
              onChange={(e) => setDetails(e.target.value)}
              disabled={pending}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={contactId} className="text-sm font-medium text-ink">
              {t("report.contactLabel")}
            </label>
            <Input
              id={contactId}
              type="email"
              value={contact}
              maxLength={MAX_CONTACT}
              placeholder={t("report.contactPlaceholder")}
              onChange={(e) => setContact(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            {t("report.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending && <Spinner className="size-4" />}
            {t("report.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
