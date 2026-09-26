import type { PlusInvoice } from "@houston/engine-adapter";
import { formatPlanAmount, invoiceStatusKey } from "@houston/sdk";
import { Badge, Button, Card, Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { usePlusInvoices } from "../../../hooks/queries/use-plan";
import { openExternalUrl } from "../../../lib/open-external-url";

function InvoiceRow({ invoice }: { invoice: PlusInvoice }) {
  const { t, i18n } = useTranslation("plan");
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
  }).format(new Date(invoice.createdAt));
  const hostedUrl = invoice.hostedUrl;
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <span className="min-w-0 flex-1 text-sm">{date}</span>
      <span className="text-sm tabular-nums">
        {formatPlanAmount(invoice.amount, invoice.currency, i18n.language)}
      </span>
      <Badge variant="secondary" className="md:ml-4">
        {t(`invoiceStatus.${invoiceStatusKey(invoice.status)}`)}
      </Badge>
      {hostedUrl && (
        <Button
          variant="link"
          className="self-start md:ml-4"
          onClick={() =>
            void openExternalUrl(hostedUrl, {
              command: "plus_invoice_open",
            })
          }
        >
          {t("viewInvoice")}
        </Button>
      )}
    </div>
  );
}

export function BillingInvoices() {
  const { t } = useTranslation("plan");
  const invoices = usePlusInvoices();
  return (
    <section className="space-y-4 pt-4">
      <h2 className="text-lg font-medium">{t("recentInvoices")}</h2>
      <Card className="gap-0 px-5 py-1 md:px-6">
        {invoices.isPending ? (
          <div
            className="space-y-4 py-5"
            role="status"
            aria-label={t("loadingInvoices")}
          >
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : invoices.isError ? (
          <div className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink-muted">{t("invoicesError")}</p>
            <Button variant="outline" onClick={() => void invoices.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : invoices.data?.invoices.length ? (
          invoices.data.invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))
        ) : (
          <p className="py-5 text-sm text-ink-muted">{t("noInvoices")}</p>
        )}
      </Card>
    </section>
  );
}
