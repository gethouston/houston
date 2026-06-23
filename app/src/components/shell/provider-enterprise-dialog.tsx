import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../lib/providers";

/**
 * Pre-login dialog for the "GitHub Copilot Enterprise" card. Copilot's
 * device-code flow is domain-specific — it targets the company's GitHub, not
 * github.com — so we collect the enterprise domain BEFORE starting login. On
 * Continue we hand the domain to the picker, which calls `launchLogin` with it;
 * the normal device-code dialog then takes over. Individual Copilot users use
 * the other card and never see this (their domain is github.com).
 */
interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  onConnect: (enterpriseDomain: string) => void;
}

export function ProviderEnterpriseDialog({
  provider,
  onClose,
  onConnect,
}: Props) {
  const { t } = useTranslation("providers");
  const [domain, setDomain] = useState("");

  // Reset per-open so a stale domain never leaks across opens.
  useEffect(() => {
    if (provider) setDomain("");
  }, [provider]);

  if (!provider) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = domain.trim();
    if (!trimmed) return;
    // The picker owns the async login (pending spinner + device-code dialog);
    // this dialog only collects the domain, then closes.
    onConnect(trimmed);
    onClose();
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
          <DialogTitle>{t("enterprise.title")}</DialogTitle>
          <DialogDescription>{t("enterprise.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="copilot-enterprise-domain"
              className="text-[13px] font-medium"
            >
              {t("enterprise.label")}
            </label>
            <input
              id="copilot-enterprise-domain"
              type="text"
              autoComplete="off"
              autoFocus
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder={t("enterprise.placeholder")}
              className="w-full rounded-md border bg-background px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[12px] text-muted-foreground">
              {t("enterprise.hint")}
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("enterprise.cancel")}
            </Button>
            <Button type="submit" disabled={!domain.trim()}>
              {t("enterprise.continue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
