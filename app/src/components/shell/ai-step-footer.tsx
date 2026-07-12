import { Button, Spinner } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AiStepFooterProps {
  onBack: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** Optional extra action shown left of the primary (e.g. Cancel while working). */
  secondary?: { label: string; onClick: () => void } | null;
}

export function AiStepFooter({
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondary,
}: AiStepFooterProps) {
  const { t } = useTranslation("common");

  return (
    <footer className="shrink-0 border-t border-ink/[0.06] px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("actions.back")}
        </Button>

        <div className="flex items-center gap-2">
          {secondary && (
            <Button
              type="button"
              variant="ghost"
              onClick={secondary.onClick}
              className="rounded-full"
            >
              {secondary.label}
            </Button>
          )}
          <Button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading}
            className="rounded-full"
          >
            {primaryLoading ? (
              <>
                <Spinner className="size-4" />
                {primaryLabel}
              </>
            ) : (
              primaryLabel
            )}
          </Button>
        </div>
      </div>
    </footer>
  );
}
