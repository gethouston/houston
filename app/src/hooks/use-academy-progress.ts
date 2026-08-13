import { useQuery } from "@tanstack/react-query";
import { liveAcademyPorts } from "../lib/academy/academy-ports";
import type { AcademyRank } from "../lib/academy/academy-ranks";
import { currentRank } from "../lib/academy/academy-ranks";
import type { AcademyRecord } from "../lib/academy/academy-record";
import {
  totalExperience,
  totalUsagePoints,
} from "../lib/academy/academy-record";
import {
  academyLoadFailed,
  loadAcademyRecord,
} from "../lib/academy/academy-store";
import { liveStreak } from "../lib/academy/usage-points";
import { useSession } from "./use-session";

export interface AcademyProgressState {
  record: AcademyRecord | null;
  loading: boolean;
  /**
   * The read produced NO ANSWER. Distinct from a null record, which is a real
   * answer: "this user has earned nothing yet". A screen that cannot tell the
   * two apart offers "Start" on a chapter the user finished months ago.
   *
   * Two shapes reach it: the query itself rejecting, and a load that reached
   * no engine and found nothing on the device ({@link academyLoadFailed}) —
   * the cold-pod case, which the loader deliberately does NOT reject on,
   * because a device that holds a record can still be served from it.
   */
  isError: boolean;
  /** Read the record again, for whoever draws the failure. */
  retry: () => void;
  experience: number;
  usagePoints: number;
  /** The streak as it is true TODAY — see `liveStreak`. */
  streak: { current: number; best: number };
  rank: AcademyRank;
}

export function academyProgressKey(uid: string | null) {
  return ["academy-progress", uid] as const;
}

/**
 * The signed-in user's Academy progress: the record, the two currencies it
 * carries, and the rank they add up to.
 *
 * Progress is also awarded IMPERATIVELY (the onboarding finish path calls
 * `completeSetupChapterLive` outside React), so this query is never treated as
 * fresh: it re-reads on mount and whenever the window regains focus, which is
 * exactly when a user comes back from earning something. The read is one
 * preference call plus a localStorage hit — cheap enough that staleness is the
 * more expensive choice.
 */
export function useAcademyProgress(): AcademyProgressState {
  const { data: session, isLoading: sessionLoading } = useSession();
  const uid = session?.uid ?? null;

  const query = useQuery({
    queryKey: academyProgressKey(uid),
    enabled: !sessionLoading,
    queryFn: () => loadAcademyRecord(liveAcademyPorts(uid)),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const record = query.data?.record ?? null;
  const experience = totalExperience(record);
  const usagePoints = totalUsagePoints(record);
  return {
    record,
    loading: sessionLoading || query.isPending,
    isError:
      query.isError ||
      (query.data !== undefined && academyLoadFailed(query.data)),
    retry: () => {
      void query.refetch();
    },
    experience,
    usagePoints,
    streak: liveStreak(record, new Date()),
    rank: currentRank(experience, usagePoints),
  };
}
