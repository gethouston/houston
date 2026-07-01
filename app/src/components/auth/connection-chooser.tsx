import { Button } from "@houston-ai/core";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizeEngineUrl,
  setEngineConnection,
} from "../../lib/engine-connection";
import { HoustonLogo } from "../shell/experience-card";

/**
 * First-run engine-connection chooser (HOU-621). Shown by <ConnectionGate> in
 * the TS-engine build, before any engine gate, when the user has not yet chosen
 * whether Houston runs on this computer (the Tauri host sidecar) or connects to
 * a remote engine / gateway URL.
 *
 * Applying a choice persists it and reloads the webview so app/src/lib/engine.ts
 * re-runs at module load with the choice in hand — it configures the client
 * synchronously before any HoustonClient is constructed. This screen renders
 * before the LanguageGate, so it reads the language i18n detected at boot.
 */
export function ConnectionChooser() {
  const { t } = useTranslation("connect");
  const [step, setStep] = useState<"mode" | "url">("mode");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chooseLocal = () => {
    setEngineConnection({ mode: "local" });
    window.location.reload();
  };

  const submitRemote = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEngineUrl(url);
    if (!normalized) {
      setError(t("url.invalid"));
      return;
    }
    setEngineConnection({ mode: "remote", url: normalized });
    window.location.reload();
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <HoustonLogo size={48} />
        {step === "mode" ? (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-semibold">{t("title")}</h1>
              <p className="text-sm text-muted-foreground mt-2">
                {t("subtitle")}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={chooseLocal}
                className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <span className="block text-sm font-medium">
                  {t("local.title")}
                </span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {t("local.description")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("url");
                }}
                className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <span className="block text-sm font-medium">
                  {t("remote.title")}
                </span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {t("remote.description")}
                </span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitRemote} className="flex flex-col gap-4 w-full">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">{t("url.title")}</h1>
              <p className="text-sm text-muted-foreground mt-2">
                {t("url.description")}
              </p>
            </div>
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t("url.placeholder")}
              aria-label={t("url.title")}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "connect-url-error" : undefined}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-background px-3 h-11 text-sm"
            />
            {error && (
              <p
                id="connect-url-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStep("mode");
                }}
                className="flex-1 rounded-full h-11"
              >
                {t("url.back")}
              </Button>
              <Button
                type="submit"
                disabled={!url.trim()}
                className="flex-1 rounded-full h-11"
              >
                {t("url.continue")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
