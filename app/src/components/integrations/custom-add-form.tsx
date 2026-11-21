import type {
  CustomDetectResult,
  CustomIntegrationView,
} from "@houston/engine-adapter";
import { AsyncButton, Button, Input, Switch } from "@houston-ai/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAddCustomIntegration,
  useDetectCustomIntegration,
} from "../../hooks/queries";
import { CustomAddKindToggle } from "./custom-add-kind-toggle";
import {
  addInputFrom,
  applyDetect,
  detectSummaryKey,
  EMPTY_CUSTOM_ADD_FORM,
  type CustomAddForm as FormState,
  isServiceUrl,
  oauthBlocked,
} from "./custom-add-model";

export function CustomAddForm({
  agentId,
  onBack,
  onAdded,
}: {
  agentId?: string;
  onBack: () => void;
  onAdded: (view: CustomIntegrationView) => void;
}) {
  const { t } = useTranslation("integrations");
  const [form, setForm] = useState<FormState>(EMPTY_CUSTOM_ADD_FORM);
  const [verdict, setVerdict] = useState<{
    url: string;
    result: CustomDetectResult;
  } | null>(null);
  const detect = useDetectCustomIntegration(agentId);
  const add = useAddCustomIntegration(agentId);
  const checkSeq = useRef(0);

  const canCheck = isServiceUrl(form.url) && !detect.isPending;
  const shownVerdict =
    verdict && verdict.url === form.url.trim() ? verdict.result : null;
  const input = addInputFrom(form, shownVerdict);
  const blocked = oauthBlocked(form, shownVerdict);

  const check = async () => {
    if (!canCheck) return;
    const url = form.url.trim();
    const seq = ++checkSeq.current;
    setVerdict(null);
    const result = await detect.mutateAsync(url).catch(() => null);
    if (!result || seq !== checkSeq.current) return;
    setVerdict({ url, result });
    setForm((f) => (f.url.trim() === url ? applyDetect(f, result) : f));
  };

  const submit = async () => {
    if (!input || add.isPending || blocked) return;
    const view = await add.mutateAsync(input).catch(() => null);
    if (view) onAdded(view);
  };

  return (
    <div className="flex flex-col gap-4">
      <CustomAddKindToggle
        value={form.kind}
        onChange={(kind) => {
          setForm((f) => ({ ...f, kind }));
          setVerdict(null);
        }}
      />

      <div className="space-y-1.5">
        <label
          htmlFor="custom-add-url"
          className="text-[13px] font-medium text-ink"
        >
          {t(
            form.kind === "openapi"
              ? "custom.add.urlLabelApi"
              : "custom.add.urlLabelMcp",
          )}
        </label>
        <div className="flex gap-2">
          <Input
            id="custom-add-url"
            value={form.url}
            onChange={(e) => {
              setForm((f) => ({ ...f, url: e.target.value }));
              setVerdict(null);
            }}
            placeholder={t(
              form.kind === "openapi"
                ? "custom.add.urlPlaceholderApi"
                : "custom.add.urlPlaceholderMcp",
            )}
            className="flex-1"
            autoComplete="off"
          />
          <AsyncButton
            type="button"
            size="sm"
            variant="outline"
            disabled={!canCheck}
            onClick={check}
            className="shrink-0 self-center"
          >
            {t("custom.add.check")}
          </AsyncButton>
        </div>
        {shownVerdict && (
          <p
            className={`text-[13px] ${shownVerdict.kind === "unknown" || (shownVerdict.requiresOAuth && !shownVerdict.oauthSupported) ? "text-ink-muted" : "text-success-text"}`}
            role="status"
          >
            {t(detectSummaryKey(shownVerdict))}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="custom-add-name"
          className="text-[13px] font-medium text-ink"
        >
          {t("custom.add.nameLabel")}
        </label>
        <Input
          id="custom-add-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t("custom.add.namePlaceholder")}
          autoComplete="off"
        />
      </div>

      {!(
        form.kind === "mcp" &&
        shownVerdict?.requiresOAuth &&
        shownVerdict.oauthSupported
      ) && (
        <label
          htmlFor="custom-add-needs-key"
          className="flex items-center justify-between gap-3"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink">
              {t("custom.add.needsKey")}
            </span>
            <span className="block text-[13px] text-ink-muted">
              {t("custom.add.needsKeyDesc")}
            </span>
          </span>
          <Switch
            id="custom-add-needs-key"
            checked={form.needsKey}
            onCheckedChange={(needsKey) => setForm((f) => ({ ...f, needsKey }))}
          />
        </label>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t("custom.add.back")}
        </Button>
        <AsyncButton
          type="button"
          disabled={!input || add.isPending || blocked}
          onClick={submit}
        >
          {add.isPending ? t("custom.add.submitting") : t("custom.add.submit")}
        </AsyncButton>
      </div>
    </div>
  );
}
