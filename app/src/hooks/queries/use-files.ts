import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriFiles } from "../../lib/tauri";

export function useFiles(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.list(agentPath);
    },
    enabled: !!agentPath,
  });
}

export function useDeleteFile(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relativePath: string) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.delete(agentPath, relativePath);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}

export function useRenameFile(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      relativePath,
      newName,
    }: {
      relativePath: string;
      newName: string;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.rename(agentPath, relativePath, newName);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}

export function useCreateFolder(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.createFolder(agentPath, name);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}
