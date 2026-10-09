import "@houston/app/styles/globals.css";
import i18n from "@houston/app/lib/i18n";

/** The bundle is local, so airplane mode still has a usable first frame. */
export function showOffline(onRetry: () => void): () => void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");
  const screen = document.createElement("main");
  screen.className =
    "flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 pb-safe pt-safe text-center text-ink";
  const title = document.createElement("h1");
  title.className = "text-2xl font-normal text-balance";
  title.textContent = i18n.t("shell:errorToast.offlineLaunchTitle");
  const description = document.createElement("p");
  description.className = "max-w-sm text-base text-ink-muted";
  description.textContent = i18n.t("shell:errorToast.offlineDescription");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className =
    "min-h-11 rounded-full bg-cta px-6 text-sm font-medium text-cta-text focus-visible:ring-2 focus-visible:ring-focus";
  retry.textContent = i18n.t("common:actions.retry");
  retry.addEventListener("click", onRetry);
  screen.append(title, description, retry);
  root.replaceChildren(screen);
  return () => {
    retry.removeEventListener("click", onRetry);
    screen.remove();
  };
}
