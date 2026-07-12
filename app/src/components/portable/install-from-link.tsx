/**
 * "Install from a link" — the equal-weight sibling to picking a `.houstonagent`
 * file in the import wizard's first step. The user pastes an Agent Store share
 * link (or a bare slug); Houston fetches the published agent through the host
 * (SSRF-guarded) and hands the SAME preview a file upload would produce back to
 * the wizard, which then runs its unchanged scan/name/install steps.
 *
 * Failures surface inline (the field is the user's context), with friendly,
 * localized copy per failure kind, and are still reported to Sentry so a broken
 * link is never lost.
 */

import { Button, Input } from "@houston-ai/core";
import type { PortableUploadPreviewResponse } from "@houston-ai/engine-client";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../lib/engine";
import { reportError } from "../../lib/error-toast";

interface InstallFromLinkPanelProps {
  /** Called with the fetched preview; the wizard takes over from here. */
  onPreview: (preview: PortableUploadPreviewResponse) => void;
}

/** HTTP status a `HoustonEngineError` carries, or 0 when it's not one. */
function statusOf(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === "number" ? s : 0;
  }
  return 0;
}

export function InstallFromLinkPanel({ onPreview }: InstallFromLinkPanelProps) {
  const { t } = useTranslation("portable");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageFor = (status: number): string => {
    switch (status) {
      case 400:
        return t("import.link.errors.invalid");
      case 404:
        return t("import.link.errors.notFound");
      case 422:
        return t("import.link.errors.unreadable");
      case 502:
        return t("import.link.errors.network");
      default:
        return t("import.link.errors.generic");
    }
  };

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t("import.link.errors.empty"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const preview = await getEngine().importFromStoreLink(trimmed);
      onPreview(preview);
    } catch (err) {
      const status = statusOf(err);
      setError(messageFor(status));
      reportError(
        "import_from_link",
        `install-from-link failed (${status})`,
        err,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="install-from-link"
        className="block text-sm font-medium text-foreground"
      >
        {t("import.link.label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="install-from-link"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("import.link.placeholder")}
          className="flex-1 rounded-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "install-from-link-error" : undefined}
          disabled={loading}
        />
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={loading || url.trim().length === 0}
          className="rounded-full"
        >
          <Link2 aria-hidden className="size-4" />
          {loading ? t("import.link.fetching") : t("import.link.fetch")}
        </Button>
      </div>
      {error && (
        <p
          id="install-from-link-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("import.link.hint")}</p>
    </div>
  );
}
