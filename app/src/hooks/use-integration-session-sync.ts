import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { newEngineActive, onEngineRestarted } from "../lib/engine";
import { queryKeys } from "../lib/query-keys";
import { tauriIntegrations } from "../lib/tauri";
import { useSession } from "./use-session";

export function useIntegrationSessionSync(): void {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.idToken ?? null;
  const pushedToken = useRef(false);

  const push = (value: string | null) => {
    tauriIntegrations
      .setSession(value)
      .then(() => {
        qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() });
      })
      .catch(() => {});
  };
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!newEngineActive()) return;
    if (token === null && !pushedToken.current) return;
    pushedToken.current = token !== null;
    pushRef.current(token);
  }, [token]);

  const tokenRef = useRef(token);
  tokenRef.current = token;
  useEffect(
    () =>
      onEngineRestarted(() => {
        if (!newEngineActive()) return;
        if (tokenRef.current === null) return;
        pushRef.current(tokenRef.current);
      }),
    [],
  );
}
