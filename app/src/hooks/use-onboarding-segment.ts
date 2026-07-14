import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOnboardingSegmentPreference,
  ONBOARDING_SEGMENT_PREF_KEY,
  type OnboardingSegmentChoice,
  type OnboardingSegmentPreference,
  parseOnboardingSegmentPreference,
} from "../lib/onboarding-segment";
import { tauriPreferences } from "../lib/tauri";

const queryKey = ["onboarding-segment"] as const;

export function useOnboardingSegment(enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async (): Promise<OnboardingSegmentPreference | null> => {
      const raw = await tauriPreferences.get(ONBOARDING_SEGMENT_PREF_KEY);
      return parseOnboardingSegmentPreference(raw);
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (segment: OnboardingSegmentChoice) => {
      const record = createOnboardingSegmentPreference(segment);
      await tauriPreferences.set(
        ONBOARDING_SEGMENT_PREF_KEY,
        JSON.stringify(record),
      );
      return record;
    },
    onSuccess: (record) => {
      qc.setQueryData<OnboardingSegmentPreference | null>(queryKey, record);
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await tauriPreferences.set(ONBOARDING_SEGMENT_PREF_KEY, null);
    },
    onSuccess: () => {
      qc.setQueryData<OnboardingSegmentPreference | null>(queryKey, null);
    },
  });

  return {
    preference: query.data ?? null,
    isLoading: query.isLoading,
    saveSegment: mutation.mutateAsync,
    isSaving: mutation.isPending,
    clearSegment: clearMutation.mutateAsync,
    isClearing: clearMutation.isPending,
  };
}
