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
  loading: boolean;
  failures: AgentReadFailures;
  retry: () => void;
  retrying: boolean;
}

export function useTeamRoutineDrafts(
  agent: Agent,
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
      if (failed) void activities.refetch();
    },
    retrying: failed && activities.isFetching,
  };
}
