import "@houston/app/styles/globals.css";
import { Browser } from "@capacitor/browser";
import { logAndReportError } from "@houston/app/lib/error-report";
import i18n from "@houston/app/lib/i18n";
import type { UpdateCheckResult } from "./manager";

export function clearNativeUpdateGate(): void {
  document.querySelector("[data-houston-required-update]")?.remove();
  const root = document.getElementById("root");
  root?.removeAttribute("inert");
  root?.removeAttribute("aria-hidden");
}

export function showNativeUpdateGate(
  storeUrl: string,
  checkAgain: () => Promise<UpdateCheckResult>,
): void {
  if (document.querySelector("[data-houston-required-update]")) return;
  const gate = document.createElement("main");
  gate.dataset.houstonRequiredUpdate = "";
  gate.className =
    "fixed inset-0 z-[80] flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 pb-safe pt-safe text-center text-ink";
  const heading = document.createElement("h1");
  heading.className = "text-2xl font-normal text-balance";
  heading.textContent = i18n.t("shell:mobileUpdate.title");
  const description = document.createElement("p");
  description.className = "max-w-sm text-base text-ink-muted";
  description.textContent = i18n.t(
    storeUrl
      ? "shell:mobileUpdate.description"
      : "shell:mobileUpdate.retryDescription",
  );
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
  const retry = document.createElement("button");
  retry.type = "button";
  retry.dataset.houstonCheckAgain = "";
  retry.className =
    "min-h-11 rounded-full bg-cta px-6 text-sm font-medium text-cta-text focus-visible:ring-2 focus-visible:ring-focus";
  retry.textContent = i18n.t("shell:mobileUpdate.retry");
  retry.setAttribute("aria-busy", "false");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.className = "text-sm text-ink-muted";
  let checking = false;
  retry.addEventListener("click", () => {
    if (checking) {
      status.textContent = i18n.t("shell:mobileUpdate.checking");
      return;
    }
    checking = true;
    retry.setAttribute("aria-busy", "true");
    retry.textContent = i18n.t("shell:mobileUpdate.checking");
    status.textContent = i18n.t("shell:mobileUpdate.checking");
    try {
      void Promise.resolve(checkAgain())
        .then((result) => {
          if (result === "clear") clearNativeUpdateGate();
          else if (result === "required")
            status.textContent = i18n.t("shell:mobileUpdate.stillRequired");
          else status.textContent = "";
        })
        .catch((error: unknown) =>
          logAndReportError("mobile_update_check", error),
        )
        .finally(() => {
          checking = false;
          retry.setAttribute("aria-busy", "false");
          retry.textContent = i18n.t("shell:mobileUpdate.retry");
        });
    } catch (error) {
      checking = false;
      retry.setAttribute("aria-busy", "false");
      retry.textContent = i18n.t("shell:mobileUpdate.retry");
      logAndReportError("mobile_update_check", error);
    }
  });
  gate.append(retry, status);
  const root = document.getElementById("root");
  root?.setAttribute("inert", "");
  root?.setAttribute("aria-hidden", "true");
  document.body.append(gate);
}
