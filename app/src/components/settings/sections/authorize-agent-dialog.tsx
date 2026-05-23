import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";

import { useIssueAgentCredential } from "../../../hooks/queries/use-agent-credentials";

interface Props {
  agentId: string;
  agentName: string;
  agentPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConfirmationMode = "always" | "threshold" | "never";

const CURRENCY_CHOICES = ["USD", "BRL", "EUR", "GBP"] as const;
type Currency = (typeof CURRENCY_CHOICES)[number];

/**
 * Agent authorization consent modal — maps the Figma "Authorize this
 * agent" screen onto an issueAgentCredential mutation. User sets spend
 * limits / currencies / confirmation rules, Houston builds the Beltic
 * IssueRequest and ships it.
 *
 * The `subject.id` (did:jwk) is a placeholder for this chunk — a follow-up
 * generates a real ES256 keypair server-side. Same for
 * `delegated_by_subject_id` which will pull from the workspace identity
 * credential once chunk 8 lands.
 */
export function AuthorizeAgentDialog({
  agentId,
  agentName,
  agentPath,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation("settings");
  const issue = useIssueAgentCredential(agentPath);

  const [dailyLimit, setDailyLimit] = useState("250");
  const [perTxMax, setPerTxMax] = useState("100");
  const [currencies, setCurrencies] = useState<Currency[]>(["USD"]);
  const [idle, setIdle] = useState("PT4H");
  const [confirmMode, setConfirmMode] = useState<ConfirmationMode>("threshold");
  const [threshold, setThreshold] = useState("50");
  const [declarationOk, setDeclarationOk] = useState(false);

  const subjectDid = useMemo(
    () => `did:jwk:houston-${agentId.slice(0, 12)}`,
    [agentId],
  );

  function buildRequest() {
    const dailyCents = Math.round(Number(dailyLimit) * 100);
    const perTxCents = Math.round(Number(perTxMax) * 100);
    return {
      credential_type: "agent_authorization",
      self_attestation_complete: true,
      subject: {
        type: "agent",
        id: subjectDid,
        agent_external_id: agentId,
      },
      claims: {
        permissions: [
          {
            resource_type: "wallet",
            resource_id: "*",
            actions: ["checkout", "payment_authorize"],
            conditions: [
              {
                operator: "lte",
                field: "transaction_amount",
                value: perTxCents,
              },
            ],
          },
        ],
        spend_limit: {
          amount: dailyCents,
          currency: currencies[0] ?? "USD",
          period: "daily",
        },
        authorized_currencies: currencies,
        max_idle_duration: idle,
        human_present: confirmMode !== "never",
        confirmation_threshold_cents:
          confirmMode === "threshold" ? Math.round(Number(threshold) * 100) : null,
        // Placeholder — chunk 8 wires this to the real user credential id.
        delegated_by_subject_id: "usr_houston_local",
      },
      evidence_refs: [],
      ttl: "P30D" as const,
    };
  }

  async function onSubmit() {
    if (!declarationOk) return;
    try {
      await issue.mutateAsync(buildRequest());
      onOpenChange(false);
      setDeclarationOk(false);
    } catch {
      // showErrorToast already fired inside the mutation's onError.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("agents.consent.title")} — {agentName}
          </DialogTitle>
          <DialogDescription>{t("agents.consent.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("agents.consent.spendLimits")}</h3>

            <LabeledNumber
              label={t("agents.consent.dailyLimit")}
              value={dailyLimit}
              onChange={setDailyLimit}
              suffix="USD"
            />
            <LabeledNumber
              label={t("agents.consent.perTransactionMax")}
              value={perTxMax}
              onChange={setPerTxMax}
              suffix="USD"
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium block">
                {t("agents.consent.currencies")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CURRENCY_CHOICES.map((c) => {
                  const on = currencies.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`rounded-full px-3 h-8 text-xs font-medium border transition-colors ${
                        on
                          ? "bg-gray-950 text-white border-gray-950"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                      onClick={() =>
                        setCurrencies((prev) =>
                          on
                            ? prev.filter((x) => x !== c)
                            : ([...prev, c] as Currency[]),
                        )
                      }
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <LabeledText
              label={t("agents.consent.idleTimeout")}
              value={idle}
              onChange={setIdle}
              help={t("agents.consent.idleHelp")}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("agents.consent.confirmHeader")}</h3>
            <RadioRow
              checked={confirmMode === "always"}
              onSelect={() => setConfirmMode("always")}
              title={t("agents.consent.confirmAlways")}
              desc={t("agents.consent.confirmAlwaysDesc")}
            />
            <RadioRow
              checked={confirmMode === "threshold"}
              onSelect={() => setConfirmMode("threshold")}
              title={t("agents.consent.confirmThreshold")}
              desc={t("agents.consent.confirmThresholdDesc")}
            />
            {confirmMode === "threshold" ? (
              <div className="pl-7">
                <LabeledNumber
                  label={t("agents.consent.thresholdLabel")}
                  value={threshold}
                  onChange={setThreshold}
                  suffix="USD"
                />
              </div>
            ) : null}
            <RadioRow
              checked={confirmMode === "never"}
              onSelect={() => setConfirmMode("never")}
              title={t("agents.consent.confirmNever")}
              desc={t("agents.consent.confirmNeverDesc")}
            />
          </section>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={declarationOk}
              onChange={(e) => setDeclarationOk(e.target.checked)}
              className="mt-1"
            />
            <span>{t("agents.consent.declaration")}</span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={issue.isPending}
          >
            {t("agents.consent.cancel")}
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={!declarationOk || issue.isPending}
          >
            {issue.isPending
              ? t("agents.consent.issuing")
              : t("agents.consent.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LabeledProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  suffix?: string;
}

function LabeledNumber({ label, value, onChange, suffix }: LabeledProps) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-44 font-medium">{label}</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-gray-300 px-2 h-9"
      />
      {suffix ? <span className="text-muted-foreground text-xs">{suffix}</span> : null}
    </label>
  );
}

function LabeledText({ label, value, onChange, help }: LabeledProps) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3 text-sm">
        <span className="w-44 font-medium">{label}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-2 h-9 font-mono text-xs"
        />
      </label>
      {help ? <p className="text-xs text-muted-foreground pl-44 ml-3">{help}</p> : null}
    </div>
  );
}

function RadioRow({
  checked,
  onSelect,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        checked
          ? "border-gray-950 bg-gray-50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-4 h-4 rounded-full border-2 ${
            checked ? "border-gray-950 bg-gray-950" : "border-gray-300"
          }`}
        />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground pl-6 mt-0.5">{desc}</p>
    </button>
  );
}
