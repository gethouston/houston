import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { latestCachedAgentActivities } from "../../lib/all-conversations-cache";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity } from "../../lib/tauri";

export function activityQueryOptions(qc: QueryClient, agentPath: string) {
  return {
    queryKey: queryKeys.activity(agentPath),
    queryFn: () => tauriActivity.list(agentPath),
    placeholderData: () => latestCachedAgentActivities(qc, agentPath),
  };
}

export function useActivity(agentPath: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    ...activityQueryOptions(queryClient, agentPath ?? ""),
    enabled: !!agentPath,
  });
}

export function useUpdateActivityForAnyAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentPath,
      activityId,
      update,
    }: {
      agentPath: string;
      activityId: string;
      update: { status?: string; title?: string; description?: string };
    }) => tauriActivity.update(agentPath, activityId, update),
    onSuccess: (_r, { agentPath }) =>
      qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) }),
  });
}
