import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import type { ProviderInfo } from "../../lib/providers";
import { tauriSystem } from "../../lib/tauri";

/**
 * Desktop Claude BROWSER login dialog. The happy path is fully seamless: the
 * native `claude auth login` opened the browser, the approval page hands its
 * authorization code straight back to the CLI, and this dialog is only a
 * spinner ("approve in your browser") with a "didn't open" fallback link —
 * no code UI anywhere.
 *
 * When the page-to-CLI hand-off is blocked (firewalls, strict browsers —
 * HOU-839) the approval page shows the user a code instead. That case is
 * recovered in stages, most seamless first:
 *   1. Auto-finish: the user copies the code and switches back to Houston;
 *      on refocus `onClipboardProbe` feeds a code-shaped clipboard string to
 *      the CLI silently. Zero typing, zero code UI.
 *   2. Only if the probe finds nothing does a small "Claude showed you a
 *      code?" link appear; clicking it reveals a paste field (`onSubmitCode`).
 * Completion always arrives via `claude-login://done`, which unmounts this
 * dialog from the parent. Closing cancels the sign-in.
 */
interface Props {
  provider: ProviderInfo;
  url: string;
  onClipboardProbe: () => Promise<boolean>;
  onSubmitCode: (code: string) => Promise<void>;
  onClose: () => void;
}

/** Backstop reveal for users who never blur the window (e.g. the browser did
 * not open): after this long the "Claude showed you a code?" link appears. */
const REVEAL_FALLBACK_MS = 45_000;

type Stage = "waiting" | "revealed" | "form" | "finishing";

export function ProviderLoginBrowserPending({
  provider,
  url,
  onClipboardProbe,
  onSubmitCode,
  onClose,
}: Props) {
  const { t } = useTranslation("providers");
  const [stage, setStage] = useState<Stage>("waiting");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wasAway = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  // Refocus after being away is the stuck-hand-off signature (a completed
  // hand-off closes this dialog before the user returns): silently try to
  // finish from a copied code; only when that finds nothing, surface the link.
  useEffect(() => {
    const onBlur = () => {
      wasAway.current = true;
    };
    const onFocus = () => {
      if (!wasAway.current || stageRef.current === "finishing") return;
      wasAway.current = false;
      void onClipboardProbe()
        .catch(() => false)
        .then((consumed) => {
          if (consumed) {
            setStage("finishing");
          } else if (stageRef.current === "waiting") {
            setStage("revealed");
          }
        });
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    const timer = setTimeout(() => {
      if (stageRef.current === "waiting") setStage("revealed");
    }, REVEAL_FALLBACK_MS);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      clearTimeout(timer);
    };
  }, [onClipboardProbe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setError(null);
    setStage("finishing");
    try {
      await onSubmitCode(trimmed);
      // Stay open: the CLI finishes its own exchange and the parent closes on
      // `claude-login://done`.
    } catch (err) {
      setError(genericErrorDescription("provider_login_submit_code", err));
      setStage("form");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("providerLogin.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {t("providerLogin.browserDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 text-[13px] text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>
            {stage === "finishing"
              ? t("providerLogin.submitting")
              : t("providerLogin.deviceWaiting")}
          </span>
        </div>

        {stage === "revealed" && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-ink-muted"
            onClick={() => setStage("form")}
          >
            {t("providerLogin.browserCodeReveal")}
          </Button>
        )}

        {stage === "form" && (
          <form onSubmit={handleSubmit} className="space-y-2">
            <label
              htmlFor="provider-login-browser-code"
              className="block text-[13px] text-ink-muted"
            >
              {t("providerLogin.browserCodeHint")}
            </label>
            <div className="flex gap-2">
              <input
                id="provider-login-browser-code"
                type="text"
                autoComplete="off"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("providerLogin.codePlaceholder")}
                className="w-full rounded-md border bg-input px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-focus"
              />
              <Button type="submit" disabled={!code.trim()}>
                {t("providerLogin.submit")}
              </Button>
            </div>
            {error && (
              <p className="text-[12px] text-danger" role="alert">
                {error}
              </p>
            )}
          </form>
        )}

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto gap-1.5 p-0 text-ink-muted"
            onClick={() => void tauriSystem.openUrl(url)}
          >
            <ExternalLink className="size-3.5" />
            {t("providerLogin.browserOpen")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("providerLogin.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
