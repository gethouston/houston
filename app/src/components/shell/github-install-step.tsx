import { Button, DialogTitle, Input, Spinner } from "@houston-ai/core";
import { ArrowLeft, Github } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { tauriAgents } from "../../lib/tauri";

/**
 * The host answers install failures with a plain-English `{ error }` body
 * (bad URL, no houston.json, GitHub down); `HoustonEngineError.message` is
 * just "engine error <status>", so prefer the body's reason when present.
 */
function installErrorText(err: unknown): string {
  const body = (err as { body?: { error?: unknown } }).body;
  if (body && typeof body.error === "string") return body.error;
  return err instanceof Error ? err.message : String(err);
}

interface GithubInstallStepProps {
  onBack: () => void;
  /** Runs after a successful install (reload the catalog, advance the flow). */
  onInstalled: (configId: string) => Promise<void>;
}

/**
 * "Install from GitHub" step of the create-agent dialog: paste a repo that
 * holds a `houston.json`, the host adds it to the config library, and the
 * flow jumps straight to naming an agent created from it.
 */
export function GithubInstallStep({
  onBack,
  onInstalled,
}: GithubInstallStepProps) {
  const { t } = useTranslation("shell");
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  const handleInstall = async () => {
    const trimmed = url.trim();
    if (!trimmed || installing) return;
    setError("");
    setInstalling(true);
    try {
      const configId = await tauriAgents.installFromGithub(trimmed);
      await onInstalled(configId);
    } catch (err) {
      setError(installErrorText(err));
      setInstalling(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <button
        type="button"
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("newAgent.githubTitle")}</DialogTitle>

      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <Github className="size-8 text-foreground" />
        <div className="text-center">
          <p className="text-lg font-semibold">{t("newAgent.githubTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("newAgent.githubDescription")}
          </p>
        </div>

        <div className="flex w-full gap-2 pt-2">
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleInstall();
            }}
            placeholder={t("newAgent.githubPlaceholder")}
            disabled={installing}
            autoFocus
            className="flex-1 rounded-full"
          />
          <Button
            onClick={handleInstall}
            disabled={!url.trim() || installing}
            className="shrink-0 rounded-full"
          >
            {installing ? (
              <Spinner className="size-4" />
            ) : (
              t("newAgent.githubInstall")
            )}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {installing && (
          <p className="text-sm text-muted-foreground">
            {t("newAgent.githubInstalling")}
          </p>
        )}
      </div>
    </div>
  );
}
