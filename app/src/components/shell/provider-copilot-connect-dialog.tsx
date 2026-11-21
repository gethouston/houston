import { FormDialog } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveCopilotDomain } from "../../lib/copilot-domain";
import { stayOpen } from "../../lib/dialog-stay-open";
import type { ProviderInfo } from "../../lib/providers";

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
  const [domainInvalid, setDomainInvalid] = useState(false);
  const connected = useRef(false);

  useEffect(() => {
    if (provider) {
      setPlan("personal");
      setDomain("");
      setDomainInvalid(false);
      connected.current = false;
    }
  }, [provider]);

  if (!provider) return null;

  const canSubmit = plan === "personal" || domain.trim().length > 0;

  const handleSubmit = () => {
    if (plan === "company") {
      const target = resolveCopilotDomain(domain);
      if (target.kind === "invalid") {
        setDomainInvalid(true);
        return stayOpen();
      }
      onConnect(target.kind === "enterprise" ? target.domain : undefined);
    } else {
      onConnect(undefined);
    }
    connected.current = true;
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open && !connected.current) onClose();
      }}
      title={t("copilot.title")}
      description={t("copilot.description")}
      primary={{
        label: t("copilot.continue"),
        onClick: handleSubmit,
        disabled: !canSubmit,
      }}
      labels={{ cancel: t("copilot.cancel") }}
    >
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
            className="text-sm font-medium"
          >
            {t("copilot.domainLabel")}
          </label>
          <input
            id="copilot-enterprise-domain"
            type="text"
            autoComplete="off"
            // biome-ignore lint/a11y/noAutofocus: the company plan asks for exactly this one value, and the field appears because the user just chose it; the rule tolerated the same autofocus before only because the <input> sat lexically inside <Dialog>.
            autoFocus
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setDomainInvalid(false);
            }}
            placeholder={t("copilot.domainPlaceholder")}
            aria-invalid={domainInvalid}
            className="w-full rounded-md border bg-input px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-focus"
          />
          {domainInvalid ? (
            <p role="alert" className="text-xs text-danger">
              {t("copilot.domainInvalid")}
            </p>
          ) : (
            <p className="text-xs text-ink-muted">{t("copilot.domainHint")}</p>
          )}
        </div>
      )}
    </FormDialog>
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
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{description}</span>
      </span>
    </label>
  );
}
