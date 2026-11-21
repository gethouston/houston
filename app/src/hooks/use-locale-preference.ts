import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  applyEngineLocale,
  changeLocale,
  isSupported,
  LOCALE_PREF_KEY,
  localeGateIsLoading,
  resolveEffectiveLocale,
  type SupportedLocale,
} from "../lib/i18n";
import { logger } from "../lib/logger";
import { tauriPreferences } from "../lib/tauri";
import { useWorkspaceStore } from "../stores/workspaces";

const globalKey = ["locale-preference"] as const;

export interface LocalePreferenceState {
  locale: SupportedLocale | null;
  isLoading: boolean;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  clearLocale: () => Promise<void>;
}

export function useLocalePreference(): LocalePreferenceState {
  const qc = useQueryClient();
  const storeCurrent = useWorkspaceStore((s) => s.current);
  const [applied, setApplied] = useState(false);

  const globalQuery = useQuery({
    queryKey: globalKey,
    queryFn: async (): Promise<SupportedLocale | null> => {
      try {
        const raw = await tauriPreferences.get(LOCALE_PREF_KEY);
        return isSupported(raw) ? raw : null;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

  const globalLocale = globalQuery.data ?? null;
  const workspaceLocale = storeCurrent?.locale ?? null;
  const effective = resolveEffectiveLocale(workspaceLocale, globalLocale);

  useEffect(() => {
    if (globalQuery.isLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        await applyEngineLocale(effective);
      } catch (err) {
        logger.error(
          "[locale] applyEngineLocale failed",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        if (!cancelled) setApplied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [globalQuery.isLoading, effective]);

  const mutation = useMutation({
    mutationFn: async (locale: SupportedLocale) => {
      await changeLocale(locale);
      try {
        await tauriPreferences.set(LOCALE_PREF_KEY, locale);
      } catch (err) {
        logger.error(
          "[locale] persisting the language choice failed; applied locally, will re-sync once signed in",
          err instanceof Error ? err.message : String(err),
        );
      }
      return locale;
    },
    onSuccess: (locale) => {
      qc.setQueryData<SupportedLocale | null>(globalKey, locale);
    },
  });

  const setLocale = useCallback(
    async (locale: SupportedLocale) => {
      await mutation.mutateAsync(locale);
    },
    [mutation],
  );

  const clearMutation = useMutation({
    mutationFn: async () => {
      await tauriPreferences.set(LOCALE_PREF_KEY, "");
    },
    onSuccess: () => {
      qc.setQueryData<SupportedLocale | null>(globalKey, null);
    },
  });

  const clearLocale = useCallback(async () => {
    await clearMutation.mutateAsync();
  }, [clearMutation]);

  return {
    locale: globalLocale,
    isLoading: localeGateIsLoading(globalQuery.isLoading, applied),
    setLocale,
    clearLocale,
  };
}
