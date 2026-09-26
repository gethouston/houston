import i18n from "@houston/app/lib/i18n";
import "@houston/app/styles/globals.css";
import { Button, Card } from "@houston-ai/core";
import { I18nextProvider, useTranslation } from "react-i18next";

function CheckoutReturnContent({ complete }: { complete: boolean }) {
  const { t } = useTranslation("plan");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-ink">
      <Card className="w-full max-w-md gap-5 px-6 py-8 text-center shadow-card">
        <h1 className="text-2xl font-normal text-balance">
          {complete ? t("success") : t("cancelTitle")}
        </h1>
        <p className="text-sm text-ink-muted">
          {complete ? t("completeBody") : t("cancelBody")}
        </p>
        <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-center">
          <Button asChild>
            <a href="houston://settings/plan">{t("openHouston")}</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/settings/plan">{t("continueBrowser")}</a>
          </Button>
        </div>
      </Card>
    </main>
  );
}

export function CheckoutReturn({ complete }: { complete: boolean }) {
  return (
    <I18nextProvider i18n={i18n}>
      <CheckoutReturnContent complete={complete} />
    </I18nextProvider>
  );
}
