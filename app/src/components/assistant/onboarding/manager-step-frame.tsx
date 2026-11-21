import { Button } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CARD_ACTION_CLASS } from "./card-actions";

export function ManagerStepFrame({
  id,
  busy = false,
  footer,
  onBack = null,
  error,
  children,
}: {
  id: string;
  busy?: boolean;
  footer?: ReactNode;
  onBack?: (() => void) | null;
  error?: string | null;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <div
      data-testid="manager-step"
      data-step={id}
      className="ht-shadow-dialog flex max-h-[65cqh] flex-col overflow-clip rounded-2xl border border-line/50 bg-dialog"
    >
      <div
        key={id}
        inert={busy}
        aria-busy={busy || undefined}
        className="create-swap-in min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-6 md:px-8"
      >
        {children}
      </div>
      {error ? (
        <p
          role="alert"
          className="shrink-0 px-5 pb-3 text-sm text-danger-ink md:px-8"
        >
          {error}
        </p>
      ) : null}
      {footer || onBack ? (
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 md:flex-row md:items-center md:justify-end md:px-8">
          {footer}
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              className={`${CARD_ACTION_CLASS} md:order-first md:mr-auto`}
              disabled={busy}
              onClick={onBack}
            >
              {t("actions.back")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ManagerStepBody({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-balance text-2xl font-normal">{title}</h2>
        {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
