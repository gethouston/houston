import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { serialQueue } from "../../lib/serial-queue";
import { tauriAgent } from "../../lib/tauri";

const queued = serialQueue();

export function instructionsQueryOptions(agentPath: string | undefined) {
  return {
    queryKey: queryKeys.instructions(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriAgent.readFile(agentPath, "CLAUDE.md");
    },
    enabled: !!agentPath,
    staleTime: 30_000,
  };
}

export function useInstructions(agentPath: string | undefined) {
  return useQuery(instructionsQueryOptions(agentPath));
}

export function useSaveInstructions(agentPath: string | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation("agents");
  return (content: string): Promise<boolean> => {
    if (!agentPath) return Promise.resolve(false);
    let saved = false;
    return optimisticWrite({
      qc,
      command: "save_instructions",
      patches: [
        { queryKey: queryKeys.instructions(agentPath), apply: () => content },
      ],
      write: () =>
        queued(agentPath, async () =>
          tauriAgent.writeFile(agentPath, "CLAUDE.md", content),
        ),
      failure: {
        title: t("instructions.saveErrorTitle"),
        description: t("instructions.saveErrorBody"),
      },
      onSuccess: () => {
        saved = true;
      },
    }).then(() => saved);
  };
}
