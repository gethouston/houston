import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useMemo } from "react";
import { logger } from "../../lib/logger";
import { queryPersistenceOptions } from "../../lib/query-persist";
import { markRestoredListsStale } from "../../lib/query-persist-policy";

export function QueryPersistenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const persistOptions = useMemo(
    () => queryPersistenceOptions(queryClient),
    [queryClient],
  );

  if (!persistOptions) return <>{children}</>;
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => markRestoredListsStale(queryClient)}
      onError={() => {
        logger.warn("[query-persist] restore failed; using network data");
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
