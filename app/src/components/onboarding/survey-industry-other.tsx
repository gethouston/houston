import { Button, Input } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * The industry question's typed answer, in the row the filter stood in: the
 * field the user was already looking at becomes the one they answer in. The
 * survey's own Continue submits it, so the row carries only the way back to
 * the list, visible at every width (a phone has no Escape, and a desktop
 * user should not have to know it exists).
 *
 * Unclamped like every survey field: the record's code-point rule is the one
 * authority, and over-cap text stays on screen and says so (`survey-screen`).
 */
export function SurveyIndustryOther({
  value,
  disabled,
  errorId,
  onChange,
  onLeave,
}: {
  value: string;
  disabled: boolean;
  errorId: string | null;
  onChange: (value: string) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation("setup");
  return (
    <div className="create-swap-in flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <Input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={t("onboardingSurvey.otherPlaceholder")}
        aria-label={t("onboardingSurvey.otherPlaceholder")}
        aria-invalid={errorId !== null}
        aria-describedby={errorId ?? undefined}
        className="h-11 w-full rounded-full px-4 md:h-9 md:min-w-0 md:flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        onClick={onLeave}
        disabled={disabled}
        className="h-11 md:h-9"
      >
        {t("onboardingSurvey.industry.backToList")}
      </Button>
    </div>
  );
}
