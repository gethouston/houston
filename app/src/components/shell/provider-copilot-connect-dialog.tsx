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
 * GitHub Copilot connect dialog. ONE card, two plans:
 *  - **Personal** — your own Copilot on github.com (no domain).
 *  - **Company / GitHub Enterprise** — Copilot your employer provides, on their
 *    GitHub domain. The device-code flow is domain-specific, so we collect the
 *    company domain here before login.
 *
 * On submit: `onConnect(undefined)` for Personal, `onConnect(domain)` for
 * Company. The caller (picker / settings) owns the async login + spinner.
 */
type Plan = "personal" | "company";

interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  onConnect: (enterpriseDomain?: string) => void;
}

export function ProviderCopilotConnectDialog({
  provider,
  onClose,
  onConnect,
}: Props) {
  const { t } = useTranslation("providers");
  const [plan, setPlan] = useState<Plan>("personal");
  const [domain, setDomain] = useState("");

  // Reset per-open so a stale plan/domain never leaks across opens.
  useEffect(() => {
    if (provider) {
      setPlan("personal");
      setDomain("");
    }
  }, [provider]);

  if (!provider) return null;

  const canSubmit = plan === "personal" || domain.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (plan === "company") {
      const trimmed = domain.trim();
      if (!trimmed) return;
      onConnect(trimmed);
    } else {
      onConnect(undefined);
    }
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
          <DialogTitle>{t("copilot.title")}</DialogTitle>
          <DialogDescription>{t("copilot.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <PlanOption
              plan="personal"
              selected={plan === "personal"}
              onSelect={setPlan}
              title={t("copilot.personalTitle")}
              description={t("copilot.personalDesc")}
            />
            <PlanOption
              plan="company"
              selected={plan === "company"}
              onSelect={setPlan}
              title={t("copilot.companyTitle")}
              description={t("copilot.companyDesc")}
            />
          </fieldset>

          {plan === "company" && (
            <div className="space-y-1.5">
              <label
                htmlFor="copilot-enterprise-domain"
                className="text-[13px] font-medium"
              >
                {t("copilot.domainLabel")}
              </label>
              <input
                id="copilot-enterprise-domain"
                type="text"
                autoComplete="off"
                autoFocus
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={t("copilot.domainPlaceholder")}
                className="w-full rounded-md border bg-input px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-focus"
              />
              <p className="text-[12px] text-ink-muted">
                {t("copilot.domainHint")}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("copilot.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("copilot.continue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanOption({
  plan,
  selected,
  onSelect,
  title,
  description,
}: {
  plan: Plan;
  selected: boolean;
  onSelect: (plan: Plan) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${
        selected ? "border-focus bg-chip" : "border-line-input hover:bg-chip/50"
      }`}
    >
      <input
        type="radio"
        name="copilot-plan"
        checked={selected}
        onChange={() => onSelect(plan)}
        className="mt-0.5 size-4 shrink-0 hover-text"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[12px] text-ink-muted">{description}</span>
      </span>
    </label>
  );
}
