import "@houston/app/styles/globals.css";
import { Browser } from "@capacitor/browser";
import { logAndReportError } from "@houston/app/lib/error-report";
import i18n from "@houston/app/lib/i18n";

export function showNativeUpdateGate(storeUrl: string): void {
  const gate = document.createElement("main");
  gate.className =
    "fixed inset-0 z-[80] flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 pb-safe pt-safe text-center text-ink";
  const heading = document.createElement("h1");
  heading.className = "text-2xl font-normal text-balance";
  heading.textContent = i18n.t("shell:mobileUpdate.title");
  const description = document.createElement("p");
  description.className = "max-w-sm text-base text-ink-muted";
  description.textContent = i18n.t("shell:mobileUpdate.description");
  gate.append(heading, description);
  if (storeUrl) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "min-h-11 rounded-full bg-cta px-6 text-sm font-medium text-cta-text focus-visible:ring-2 focus-visible:ring-focus";
    button.textContent = i18n.t("shell:mobileUpdate.openStore");
    button.addEventListener("click", () => {
      void Browser.open({ url: storeUrl }).catch((error: unknown) =>
        logAndReportError("mobile_update_store", error),
      );
    });
    gate.append(button);
  }
  const root = document.getElementById("root");
  root?.setAttribute("inert", "");
  root?.setAttribute("aria-hidden", "true");
  document.body.append(gate);
}
