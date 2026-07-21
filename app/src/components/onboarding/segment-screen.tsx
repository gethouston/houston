import { Button, cn } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import {
  ONBOARDING_SEGMENT_SOURCE_SCREEN,
  ONBOARDING_SEGMENTS,
  type OnboardingSegment,
} from "../../lib/onboarding-segment";
import { HoustonLogo } from "../shell/experience-card";
import { FirstRunScreen } from "./first-run-screen";
import { SetupCard } from "./setup-card";

interface SegmentOption {
  id: OnboardingSegment;
  label: string;
}

interface OnboardingSegmentScreenProps {
  onContinue: (segment: OnboardingSegment) => Promise<void>;
  saving: boolean;
}

export function OnboardingSegmentScreen({
  onContinue,
  saving,
}: OnboardingSegmentScreenProps) {
  const { t } = useTranslation(["setup", "common"]);
  const [selected, setSelected] = useState<OnboardingSegment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analytics.track("onboarding_segment_screen_viewed", {
      source_screen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
    });
  }, []);

  const options = useMemo(() => {
    const labels = t("setup:onboardingSegment.options", {
      returnObjects: true,
    }) as Record<OnboardingSegment, string>;
    return ONBOARDING_SEGMENTS.map((id): SegmentOption => {
      return { id, label: labels[id] };
    });
  }, [t]);

  const choose = (segment: OnboardingSegment) => {
    setSelected(segment);
    setError(null);
    analytics.track("onboarding_segment_selected", {
      selected_segment: segment,
      source_screen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
    });
  };

  const submit = async () => {
    if (!selected || saving) return;
    setError(null);
    try {
      await onContinue(selected);
      analytics.track("onboarding_segment_continued", {
        selected_segment: selected,
        source_screen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
      });
    } catch (err) {
      setError(genericErrorDescription("save_onboarding_segment", err));
    }
  };

  // Centered hero layout (logo → question → pill grid → Continue), modeled on
  // the ChatGPT desktop segmentation screen on Houston's white setup card.
  // The footer lives inside the children so the Continue button can sit
  // centered under the grid instead of in SetupCard's corner footer.
  return (
    <FirstRunScreen>
      <SetupCard>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <HoustonLogo size={52} />
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("setup:onboardingSegment.title")}
              </h1>
              <p className="max-w-md text-sm text-ink-muted">
                {t("setup:onboardingSegment.subtitle")}
              </p>
            </div>
          </div>

          <div className="grid w-full max-w-xl grid-cols-3 gap-2.5">
            {options.map((option) => (
              <SegmentPill
                key={option.id}
                label={option.label}
                selected={selected === option.id}
                onSelect={() => choose(option.id)}
                disabled={saving}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col items-center">
            <Button
              type="button"
              size="lg"
              className="min-w-48 rounded-full"
              onClick={() => void submit()}
              disabled={!selected || saving}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("common:actions.continue")}
            </Button>
          </div>
        </div>
      </SetupCard>
    </FirstRunScreen>
  );
}

/**
 * One choice in the segment grid: a bordered pill with a centered label, like
 * the reference design. Selection is Houston-monochrome and always visible
 * without hovering — the ink border plus a faint ink wash carry it (no
 * hover-only affordances, no decorative accent color).
 */
function SegmentPill({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border px-3 py-3 text-center text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
        disabled && "cursor-not-allowed opacity-50",
        selected
          ? "border-ink bg-ink/[0.08] font-medium text-ink"
          : "border-ink/15 text-ink",
        !disabled && !selected && "hover:bg-ink/[0.04]",
      )}
    >
      {label}
    </button>
  );
}
