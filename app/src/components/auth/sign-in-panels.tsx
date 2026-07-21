import { Button } from "@houston-ai/core";
import { ArrowUpRight } from "lucide-react";
import { tauriSystem } from "../../lib/tauri";

/** Open an external URL in the system browser (matches sign-in-screen). */
const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

/** The sign-in card's right-hand referral pitch panel. */
export function ReferralPanel() {
  return (
    <div className="flex flex-col justify-between gap-6 bg-action p-8 text-action-text sm:col-span-1">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Share the love</h2>
        <p className="text-sm text-action-text/70">
          Know a team that would fly with Houston? Send them our way. When they
          commit to 5 or more licenses, your team gets $250 in credits.
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={openExternal("https://gethouston.ai/referrals")}
        className="-ml-3 gap-1 self-start text-action-text hover:bg-action-text/10 hover:text-action-text dark:hover:bg-action-text/10"
      >
        See how it works
        <ArrowUpRight className="size-4" />
      </Button>
    </div>
  );
}

/** The legal footer under the sign-in card (Privacy / Terms). */
export function LegalFooter() {
  return (
    <div className="flex items-center justify-center gap-3 py-6 text-xs text-ink-muted">
      <button
        type="button"
        onClick={openExternal("https://gethouston.ai/privacy")}
        className="underline-offset-4 hover:text-ink hover:underline"
      >
        Privacy Policy
      </button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={openExternal("https://gethouston.ai/terms")}
        className="underline-offset-4 hover:text-ink hover:underline"
      >
        Terms of Service
      </button>
    </div>
  );
}
