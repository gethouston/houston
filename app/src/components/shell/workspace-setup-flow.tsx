import { Button, Input } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ProviderBrowser } from "../provider-browser/provider-browser";
import { useProviderBrowserData } from "../provider-browser/use-provider-browser-data";

interface Props {
  /** "page" = full-page onboarding, "dialog" = inside a modal */
  mode: "page" | "dialog";
  /** Called when the full flow completes */
  onComplete: (name: string, provider: string, model: string) => void;
}

export function WorkspaceSetupFlow({ mode, onComplete }: Props) {
  const { t } = useTranslation(["setup", "common"]);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("Personal");
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  // Resolved unconditionally (hooks rule) even though the browser only renders
  // in step 2; the catalog + status queries are cached, so probing during the
  // name step is harmless.
  const { providers, connections, catalog } = useProviderBrowserData();

  const handleNameSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStep(2);
  };

  const handleProviderSelect = (p: string, m: string) => {
    setProvider(p);
    setModel(m);
  };

  const handleFinish = () => {
    if (!name.trim() || !provider || !model) return;
    onComplete(name.trim(), provider, model);
  };

  const isPage = mode === "page";

  if (step === 1) {
    return (
      <div
        className={isPage ? "flex flex-col items-center justify-center" : ""}
      >
        <div className={isPage ? "w-full max-w-sm" : "space-y-4 pt-2"}>
          {isPage && (
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold mb-1">
                {t("setup:name.title")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("setup:name.description")}
              </p>
            </div>
          )}
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("setup:name.placeholder")}
            />
            <div
              className={isPage ? "flex justify-center" : "flex justify-end"}
            >
              <Button
                type="submit"
                disabled={!name.trim()}
                className="rounded-full"
              >
                {t("common:actions.continue")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={isPage ? "flex flex-col items-center justify-center" : ""}>
      <div className={isPage ? "w-full max-w-md" : "space-y-4 pt-2"}>
        {/* Header */}
        <div className={isPage ? "text-center mb-6" : "mb-4"}>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("common:actions.back")}
          </button>
          <h2
            className={
              isPage
                ? "text-lg font-semibold mb-1"
                : "text-base font-medium mb-1"
            }
          >
            {t("setup:provider.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="setup:provider.description"
              defaults="Houston uses <emph>your own</emph> subscription. We never see your credentials."
              components={{
                emph: <strong className="text-foreground font-medium" />,
              }}
            />
          </p>
        </div>

        {/* Provider picker */}
        <ProviderBrowser
          providers={providers}
          connections={connections}
          catalog={catalog}
          onSelect={handleProviderSelect}
          selectOnMount
        />

        {/* Continue */}
        <div
          className={`mt-5 ${isPage ? "flex justify-center" : "flex justify-end"}`}
        >
          <Button
            className="rounded-full"
            disabled={!provider || !model}
            onClick={handleFinish}
          >
            {mode === "page"
              ? t("setup:provider.finishPage")
              : t("setup:provider.finishDialog")}
          </Button>
        </div>
      </div>
    </div>
  );
}
