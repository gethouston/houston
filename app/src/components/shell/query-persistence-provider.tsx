import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useMemo } from "react";
import { logger } from "../../lib/logger";
import { queryPersistenceOptions } from "../../lib/query-persist";
import { markRestoredListsStale } from "../../lib/query-persist-policy";

/**
 * Restores cloud list queries before their observers start network reads.
 *
 * This lives inside EngineGate because the persistence buster needs the hosted
 * user's JWT, and nests the same QueryClient so EngineGate's session query can
 * run before restoration. PersistQueryClientProvider still mounts the shell,
 * but pauses descendant query fetches until IndexedDB hydration settles.
 * The restored lists are marked stale before that pause lifts, so every
 * mounted list revalidates on boot (see markRestoredListsStale).
 */
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
