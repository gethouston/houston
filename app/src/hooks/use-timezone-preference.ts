import { TIMEZONE_PREFERENCE } from "@houston/sdk";
import { useCallback, useEffect, useState } from "react";
import { logAndReportError } from "../lib/error-report";
import {
  isIdentityConfigured,
  SESSION_QUERY_KEY,
  type Session,
} from "../lib/identity";
import { queryClient } from "../lib/query-client";
import { tauriPreferences } from "../lib/tauri";
import { detectTimezone, timezoneOwner } from "../lib/timezone-seed";
import { useWorkspaceStore } from "../stores/workspaces";

function useSeedTarget(): { workspaceId: string; owner: string } | null {
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const uid =
    queryClient.getQueryData<Session | null>(SESSION_QUERY_KEY)?.uid ?? null;
  const owner = timezoneOwner(uid, isIdentityConfigured(), workspaceId);
  return owner && workspaceId ? { workspaceId, owner } : null;
}

async function seedIn(workspaceId: string): Promise<string> {
  try {
    return (await tauriPreferences.seedTimezone(workspaceId, detectTimezone()))
      .timezone;
  } catch (err) {
    logAndReportError("timezone_seed", err);
    return detectTimezone();
  }
}

export function useTimezoneSeed(): void {
  const target = useSeedTarget();
  const owner = target?.owner;
  const workspaceId = target?.workspaceId;
  useEffect(() => {
    if (owner && workspaceId) void seedIn(workspaceId);
  }, [owner, workspaceId]);
}

export interface TimezoneState {
  timezone: string | null;
  loaded: boolean;
  detected: string;
  confirm: (tz: string) => Promise<void>;
}

export function useTimezonePreference(): TimezoneState {
  const target = useSeedTarget();
  const owner = target?.owner ?? null;
  const workspaceId = target?.workspaceId ?? null;
  const [reading, setReading] = useState<{
    owner: string | null;
    value: string | null;
  }>({ owner: null, value: null });

  useEffect(() => {
    if (!owner || !workspaceId) return;
    let live = true;
    void seedIn(workspaceId).then((value) => {
      if (live) setReading({ owner, value });
    });
    return () => {
      live = false;
    };
  }, [owner, workspaceId]);

  const confirm = useCallback(
    async (tz: string) => {
      await tauriPreferences.set(TIMEZONE_PREFERENCE, tz);
      setReading({ owner, value: tz });
    },
    [owner],
  );
  const loaded = owner !== null && reading.owner === owner;

  return {
    timezone: loaded ? reading.value : null,
    loaded,
    detected: detectTimezone(),
    confirm,
  };
}
