import { cn } from "@houston-ai/core";
import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CHIP_BASE } from "./choice-chips";
import {
  type GuidedStepAnswers,
  type RecapSegmentId,
  recapSegments,
} from "./create-step-recap";

/**
 * The two answers behind the last step, each as the way back to the question
 * that collected it: the industry chip returns to the industry question, the
 * role chip to the role one, and the answer the user is not fixing stays put.
 *
 * They wear the chip the questions themselves are answered with
 * ({@link CHIP_BASE}, `bg-chip` at rest), so the recap reads as two controls
 * rather than a sentence with a link buried in it. The pen says what tapping
 * one does; the chip's own height carries the thumb target on a phone.
 *
 * An answer the user typed can run to the brief's full cap, so the label
 * truncates inside its chip and the whole answer stays available as the
 * control's tooltip and its accessible name.
 */
export function AgentBriefRecap({
  answers,
  onChange,
}: {
  answers: GuidedStepAnswers;
  onChange: (step: RecapSegmentId) => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  const segments = recapSegments(answers);
  if (segments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {segments.map((segment) => (
        <button
          key={segment.id}
          type="button"
          title={segment.label}
          aria-label={
            segment.id === "context"
              ? t("roleSetup.customize.changeIndustry", {
                  answer: segment.label,
                })
              : t("roleSetup.customize.changeRole", { answer: segment.label })
          }
          onClick={() => onChange(segment.id)}
          className={cn(
            CHIP_BASE,
            "min-w-0 max-w-full bg-chip text-chip-text hover:bg-hover hover:text-hover-text",
          )}
        >
          <PenLine className="size-3.5 shrink-0 text-ink-muted" />
          <span className="truncate">{segment.label}</span>
        </button>
      ))}
    </div>
  );
}
