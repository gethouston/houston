import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriProvider } from "../../lib/tauri";
import {
  AI_HUB_VIEW_ID,
  isActiveTopLevelView,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";

export function useProviderUsage(enabled: boolean) {
  const active = useUIStore((s) =>
    isActiveTopLevelView(s.viewMode, AI_HUB_VIEW_ID),
  );
  return useQuery({
    queryKey: queryKeys.providerUsage(),
    queryFn: () => tauriProvider.usage(),
    enabled: enabled && active,
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
  });
}
