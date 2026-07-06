import { Button, Spinner, Switch } from "@houston-ai/core";
import { ExternalLink, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appDisplayName, type LocalModelKind } from "../../lib/local-model";
import { osOpenUrl } from "../../lib/os-bridge";

/** Download pages for the friendly empty state. Brand URLs, not translated. */
const APP_LINKS: { kind: LocalModelKind; url: string }[] = [
  { kind: "lmstudio", url: "https://lmstudio.ai" },
  { kind: "jan", url: "https://jan.ai" },
  { kind: "ollama", url: "https://ollama.com" },
];

/** A quiet centered status block (spinner + line) for the busy screens. An
 *  optional Cancel aborts the in-flight detect/connect and closes the dialog. */
export function BusyScreen({
  title,
  body,
  onCancel,
  cancelLabel,
}: {
  title: string;
  body?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
      <Spinner className="size-6 text-muted-foreground" />
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {body && (
        <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {onCancel && cancelLabel && (
        <Button variant="ghost" size="sm" className="mt-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}

/** Friendly, jargon-free guidance when no local app is running. */
export function EmptyScreen({
  onRecheck,
  onManual,
}: {
  onRecheck: () => void;
  onManual: () => void;
}) {
  const { t } = useTranslation("providers");
  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t("localModel.empty.body")}
      </p>
      <ul className="flex flex-col gap-2">
        {APP_LINKS.map(({ kind, url }) => (
          <li
            key={kind}
            className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground">
              <Laptop className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-medium text-foreground">
                {appDisplayName(kind)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t(`localModel.empty.apps.${kind}`)}
              </span>
              <span className="mt-0.5 text-[11px] font-medium text-foreground/75">
                {t(`localModel.empty.hint.${kind}`)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void osOpenUrl(url)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-foreground hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("localModel.empty.get")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {t("localModel.empty.reassure")}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <ManualLink onClick={onManual} />
        <Button onClick={onRecheck}>{t("localModel.empty.recheck")}</Button>
      </div>
    </div>
  );
}

/** Calm error screen with retry + the manual escape hatch. */
export function ErrorScreen({
  onRetry,
  onManual,
}: {
  onRetry: () => void;
  onManual: () => void;
}) {
  const { t } = useTranslation("providers");
  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t("localModel.error.body")}
      </p>
      <div className="flex items-center justify-between gap-2">
        <ManualLink onClick={onManual} />
        <Button onClick={onRetry}>{t("localModel.error.retry")}</Button>
      </div>
    </div>
  );
}

/**
 * Opt-in "show the model's thinking" toggle, shared by the guided pick step and
 * the manual form. On => the saved endpoint is marked as a reasoning model, so
 * Houston surfaces its chain-of-thought. Accessible label + microcopy, design
 * tokens only. `id` keeps the label association unique per host form.
 */
export function ReasoningToggle({
  id = "lm-reasoning",
  checked,
  onChange,
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("providers");
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary px-3 py-2.5">
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer flex-col"
      >
        <span className="text-[13px] font-medium text-foreground">
          {t("localModel.reasoning.label")}
        </span>
        <span className="text-[11px] leading-relaxed text-muted-foreground">
          {t("localModel.reasoning.help")}
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}

/** The shared "enter details manually" text link. */
export function ManualLink({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("providers");
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {t("localModel.manual.link")}
    </button>
  );
}
