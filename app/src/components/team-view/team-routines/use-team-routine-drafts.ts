import type { Routine } from "@houston/engine-adapter";
import type { RoutineDraft } from "@houston-ai/routines";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { activityQueryOptions } from "../../../hooks/queries";
import {
  type AgentReadFailures,
  agentReadFailures,
} from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import { teamRoutineDrafts } from "../team-routines-model";

export interface TeamRoutineDrafts {
  list: RoutineDraft[];
  /** The activity read has not answered yet. */
  loading: boolean;
  /** Whether the setup chats could not be read, for the strip. */
  failures: AgentReadFailures;
  /** Refetch the activity read when it failed. */
  retry: () => void;
  retrying: boolean;
}

/**
 * The employee's DRAFT routines, over the SAME activity key the board uses
 * (`activityQueryOptions`), so both share one cache entry and invalidation.
 * A routine being built in chat is an unclaimed setup ACTIVITY, invisible to
 * every routines read; see {@link teamRoutineDrafts}.
 */
export function useTeamRoutineDrafts(
  agent: Agent,
  /** The employee's routines: a draft is a setup chat NO routine claimed. */
  routines: Routine[] | undefined,
): TeamRoutineDrafts {
  const queryClient = useQueryClient();
  const activities = useQuery(
    activityQueryOptions(queryClient, agent.folderPath),
  );
  const list = useMemo(
    () => teamRoutineDrafts(activities.data, routines),
    [activities.data, routines],
  );
  const failed = activities.error != null;

  return {
    list,
    loading: activities.isLoading,
    failures: agentReadFailures([{ agent, error: activities.error }]),
    retry: () => {
      // Resolves with the outcome rather than rejecting; a second failure
      // repaints the strip that offered the retry.
      if (failed) void activities.refetch();
    },
    retrying: failed && activities.isFetching,
  };
}
