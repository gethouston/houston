import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOnboardingSegmentPreference,
  ONBOARDING_SEGMENT_PREF_KEY,
  type OnboardingSegmentChoice,
  type OnboardingSegmentPreference,
  onboardingSegmentLocalKey,
  parseOnboardingSegmentPreference,
} from "../lib/onboarding-segment";
import { tauriPreferences } from "../lib/tauri";
import { useSession } from "./use-session";

const queryKey = ["onboarding-segment"] as const;

// Device-local mirror of the answered segment (per signed-in uid). The engine
// preference lives on the user's pod in hosted mode, so a pod blip or a failed
// write used to re-prompt the question on every launch — the mirror guarantees
// the screen shows AT MOST ONCE per user per device even when the engine pref
// is unreachable. localStorage failures are non-fatal (behaves as before).
function readLocalMirror(
  uid: string | null,
): OnboardingSegmentPreference | null {
  try {
    return parseOnboardingSegmentPreference(
      localStorage.getItem(onboardingSegmentLocalKey(uid)),
    );
  } catch {
    return null;
  }
}

function writeLocalMirror(uid: string | null, serialized: string): void {
  try {
    localStorage.setItem(onboardingSegmentLocalKey(uid), serialized);
  } catch {
    /* quota / disabled storage — the engine pref still carries the answer */
  }
}

export function useOnboardingSegment(enabled: boolean) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const uid = session?.uid ?? null;

  const query = useQuery({
    queryKey: [...queryKey, uid],
    enabled,
    queryFn: async (): Promise<OnboardingSegmentPreference | null> => {
      let fromEngine: OnboardingSegmentPreference | null = null;
      let raw: string | null = null;
      try {
        raw = await tauriPreferences.get(ONBOARDING_SEGMENT_PREF_KEY);
        fromEngine = parseOnboardingSegmentPreference(raw);
      } catch {
        // Engine unreachable (hosted pod waking / provisioning) — fall through
        // to the local mirror rather than re-prompting an answered question.
      }
      if (fromEngine) {
        if (raw) writeLocalMirror(uid, raw); // refresh the mirror
        return fromEngine;
      }
      return readLocalMirror(uid);
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (segment: OnboardingSegmentChoice) => {
      const record = createOnboardingSegmentPreference(segment);
      const serialized = JSON.stringify(record);
      // The local mirror is written FIRST: once the user answered, the screen
      // must never re-prompt on this device even if the engine write fails.
      writeLocalMirror(uid, serialized);
      try {
        await tauriPreferences.set(ONBOARDING_SEGMENT_PREF_KEY, serialized);
      } catch (e) {
        // Best-effort: the answer is kept locally; the engine pref catches up
        // on a later save or stays device-local. Logged, never blocks the flow.
        console.error("[onboarding-segment] engine pref write failed", e);
      }
      return record;
    },
    onSuccess: (record) => {
      qc.setQueryData<OnboardingSegmentPreference | null>(
        [...queryKey, uid],
        record,
      );
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      try {
        localStorage.removeItem(onboardingSegmentLocalKey(uid));
      } catch {
        /* disabled storage */
      }
      await tauriPreferences.set(ONBOARDING_SEGMENT_PREF_KEY, null);
    },
    onSuccess: () => {
      qc.setQueryData<OnboardingSegmentPreference | null>(
        [...queryKey, uid],
        null,
      );
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
