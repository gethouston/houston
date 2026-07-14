import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import {
  ONBOARDING_SEGMENT_SOURCE_SCREEN,
  ONBOARDING_SEGMENTS,
  type OnboardingSegment,
} from "../../lib/onboarding-segment";
import { SpaceScreen } from "../space/space-screen";
import { OptionCard, SetupCard } from "./setup-card";

interface SegmentOption {
  id: OnboardingSegment;
  label: string;
  description: string;
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
    }) as Record<OnboardingSegment, { label: string; description: string }>;
    return ONBOARDING_SEGMENTS.map((id): SegmentOption => {
      return {
        id,
        label: labels[id].label,
        description: labels[id].description,
      };
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

  return (
    <SpaceScreen>
      <SetupCard
        onSpace
        eyebrow={t("setup:onboardingSegment.eyebrow")}
        title={t("setup:onboardingSegment.title")}
        subtitle={t("setup:onboardingSegment.subtitle")}
        onNext={() => void submit()}
        nextLabel={t("common:actions.continue")}
        nextDisabled={!selected}
        nextLoading={saving}
        helper={t("setup:onboardingSegment.helper")}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {options.map((option) => (
            <OptionCard
              key={option.id}
              label={option.label}
              description={option.description}
              selected={selected === option.id}
              onSelect={() => choose(option.id)}
              disabled={saving}
            />
          ))}
          {error && (
            <p className="mt-3 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </SetupCard>
    </SpaceScreen>
  );
}
