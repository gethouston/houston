import {
  CLOSED_CHOICE_PICKER,
  choicePickerEntry,
  formatCutoverDate,
  formatCutoverDay,
  openChoicePicker,
} from "@houston/sdk";
import { Button, Card } from "@houston-ai/core";
import { type RefObject, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBillingChoice } from "../../../hooks/queries/use-billing-choice";
import { useChoiceNow } from "../../../hooks/use-choice-now";
import { FreeOrgPicker } from "../../shell/free-org-picker";
import { useOrgName } from "../../shell/free-org-picker-rows";

/**
 * The way back into the free-org picker while a pick is still open, so a
 * dismissed announcement never strands an owner who still has to choose.
 * The SDK decides what stays ({@link choicePickerEntry}): past the deadline
 * the row goes, but an open picker or success step stays until closed, and
 * its focus then lands on `fallbackFocus`, which outlives the row.
 */
export function FreeOrgChoiceRow({
  fallbackFocus,
}: {
  fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation("plan");
  const { data: choice } = useBillingChoice();
  const orgName = useOrgName();
  const [frame, setFrame] = useState(CLOSED_CHOICE_PICKER);
  const opener = useRef<HTMLButtonElement>(null);
  const now = useChoiceNow(choice);
  const entry = choicePickerEntry(choice, now, frame);
  if (!choice || entry === "none") return null;
  const free = choice.orgs.find((org) => org.slug === choice.freeOrgSlug);
  // After the cutover the row changes the pick it applied, inside the window.
  const applied =
    choice.state === "applied" && free && choice.changeableUntil
      ? {
          name: orgName(free),
          date: formatCutoverDay(choice.changeableUntil, i18n.language),
        }
      : null;
  // The picker keeps its slot whether or not the row shows, so it never remounts.
  return (
    <>
      {entry === "row" && (
        <Card className="gap-0 px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-medium">
                {applied
                  ? t("choice.settings.appliedTitle")
                  : t("choice.settings.title")}
              </h2>
              <p className="text-sm text-ink-muted">
                {applied
                  ? t("choice.settings.applied", applied)
                  : free
                    ? t("choice.settings.picked", {
                        name: orgName(free),
                        day: formatCutoverDay(choice.cutoverAt, i18n.language),
                      })
                    : t("choice.settings.pending", {
                        date: formatCutoverDate(
                          choice.cutoverAt,
                          i18n.language,
                        ),
                      })}
              </p>
            </div>
            <Button
              ref={opener}
              variant="outline"
              className="self-start md:self-auto"
              onClick={() => setFrame(openChoicePicker())}
            >
              {free ? t("choice.settings.change") : t("choice.settings.choose")}
            </Button>
          </div>
        </Card>
      )}
      <FreeOrgPicker
        choice={choice}
        frame={frame}
        setFrame={setFrame}
        returnFocus={() => (opener.current ?? fallbackFocus.current)?.focus()}
      />
    </>
  );
}
