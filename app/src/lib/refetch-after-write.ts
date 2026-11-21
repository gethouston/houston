import type { QueryClient, QueryKey } from "@tanstack/react-query";

export async function refetchAfterWrite(
  qc: QueryClient,
  queryKey: QueryKey,
): Promise<void> {
  await qc.cancelQueries({ queryKey });
  await qc.invalidateQueries({ queryKey });
}
