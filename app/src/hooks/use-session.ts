import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { logger } from "../lib/logger";
import { isAuthConfigured, supabase } from "../lib/supabase";

const SESSION_KEY = ["session"] as const;

/**
 * Current Supabase session. Returns `null` when signed out or when Supabase
 * isn't configured (dev builds without SUPABASE_URL). Subscribes to
 * `onAuthStateChange` so the rest of the app reacts to sign-in / sign-out
 * / silent token refresh without re-querying.
 */
export function useSession() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthConfigured()) return;
    logger.info("[auth] onAuthStateChange listener attached");
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      logger.info(
        `[auth] onAuthStateChange fired: ${event} (session=${session ? "present" : "null"})`,
      );
      qc.setQueryData<Session | null>(SESSION_KEY, session ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  return useQuery<Session | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      if (!isAuthConfigured()) return null;
      const { data } = await supabase.auth.getSession();
      return data.session ?? null;
    },
    staleTime: Infinity,
    // Don't retry indefinitely if Supabase is unreachable — fall through and
    // let the UI decide (transient network blips shouldn't kick the user).
    retry: 1,
  });
}
