import { Button, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type TeamCardPrimary =
  | {
      kind: "action";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      busy?: boolean;
    }
  | {
      kind: "submit";
      label: string;
      formId: string;
      disabled?: boolean;
      busy?: boolean;
    };

export function TeamCardFooter({
  onBack,
  primary,
  secondary,
}: {
  onBack: (() => void) | null;
  primary: TeamCardPrimary | null;
  secondary?: { label: string; onClick: () => void };
}) {
  const { t } = useTranslation("common");
  const busy = primary?.busy ?? false;
  if (!onBack && !primary && !secondary) return null;

  return (
    <div className="flex shrink-0 flex-col-reverse gap-2 pt-4 md:flex-row md:items-center md:justify-between md:gap-3 md:pt-6">
      <div className="flex flex-col md:flex-row">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 rounded-full md:h-10 md:px-5"
            onClick={onBack}
            disabled={busy}
          >
            {t("actions.back")}
          </Button>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center">
        {secondary && (
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-full md:h-10 md:px-5"
            onClick={secondary.onClick}
            disabled={busy}
          >
            {secondary.label}
          </Button>
        )}
        {primary && (
          <Button
            type={primary.kind === "submit" ? "submit" : "button"}
            form={primary.kind === "submit" ? primary.formId : undefined}
            onClick={primary.kind === "action" ? primary.onClick : undefined}
            disabled={primary.disabled || busy}
            aria-busy={busy || undefined}
            className="h-11 rounded-full active:scale-[0.96] md:h-10 md:min-w-40 md:px-6"
          >
            {busy && <Spinner className="size-4" />}
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
