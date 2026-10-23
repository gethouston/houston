import {
  CHECKOUT_RETURN_CHANNEL,
  desktopReturnLink,
  type OrgCheckoutReturn,
  orgReturnFromCheckoutPage,
  webReturnPath,
} from "@houston/app/lib/checkout-return";
import {
  handOffCheckoutReturn,
  type ReturnPagePorts,
} from "@houston/app/lib/checkout-return-handoff";
import i18n from "@houston/app/lib/i18n";
import "@houston/app/styles/globals.css";
import { Button, Card } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

function browserPorts(show: ReturnPagePorts["show"]): ReturnPagePorts {
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(CHECKOUT_RETURN_CHANNEL);
  return {
    channel: channel && {
      post: (message) => channel.postMessage(message),
      listen: (onMessage) => {
        const handler = (event: MessageEvent) => onMessage(event.data);
        channel.addEventListener("message", handler);
        return () => channel.removeEventListener("message", handler);
      },
    },
    close: () => window.close(),
    navigate: (path) => window.location.replace(path),
    openDeepLink: (link) => {
      window.location.href = link;
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    show,
  };
}

/** Where the page sends the person: an org's Billing, else the Plus plan. */
function links(org: OrgCheckoutReturn | null) {
  return org
    ? { app: desktopReturnLink(org), web: webReturnPath(org) }
    : { app: "houston://settings/plan", web: "/settings/plan" };
}

/** One handoff per page load; a remount must not ask the desktop app twice. */
let handedOff = false;

function CheckoutReturnContent({
  complete,
  org,
}: {
  complete: boolean;
  org: OrgCheckoutReturn | null;
}) {
  const { t } = useTranslation("plan");
  const [where, setWhere] = useState<"web" | "desktop" | null>(null);
  useEffect(() => {
    if (!org || handedOff) return;
    handedOff = true;
    void handOffCheckoutReturn(org, browserPorts(setWhere));
  }, [org]);
  const target = links(org);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-ink">
      <Card className="w-full max-w-md gap-5 px-6 py-8 text-center shadow-card">
        <h1 className="text-2xl font-normal text-balance">
          {complete ? t("success") : t("cancelTitle")}
        </h1>
        <p className="text-sm text-ink-muted">
          {complete ? t("completeBody") : t("cancelBody")}
        </p>
        {where && (
          <p className="text-sm text-ink-muted" role="status">
            {where === "web" ? t("returnTaken") : t("returnOpening")}
          </p>
        )}
        <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-center">
          <Button asChild>
            <a href={target.app}>{t("openHouston")}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={target.web}>{t("continueBrowser")}</a>
          </Button>
        </div>
      </Card>
    </main>
  );
}

export function CheckoutReturn({ complete }: { complete: boolean }) {
  const org = orgReturnFromCheckoutPage(window.location.search, complete);
  return (
    <I18nextProvider i18n={i18n}>
      <CheckoutReturnContent complete={complete} org={org} />
    </I18nextProvider>
  );
}
