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
  isError: boolean;
  retry: () => void;
  experience: number;
  usagePoints: number;
  streak: { current: number; best: number };
  rank: AcademyRank;
}

export function academyProgressKey(uid: string | null) {
  return ["academy-progress", uid] as const;
}

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
