import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriPreferences, tauriWorkspaces } from "../lib/tauri";
import { logger } from "../lib/logger";
import { useWorkspaceStore } from "../stores/workspaces";
import {
  LOCALE_PREF_KEY,
  activeWorkspaceLocale,
  applyEngineLocale,
  changeLocale,
  isSupported,
  resolveEffectiveLocale,
  type SupportedLocale,
} from "../lib/i18n";

const globalKey = ["locale-preference"] as const;
const bootWorkspaceKey = ["boot-workspace-locale"] as const;
const LAST_WORKSPACE_KEY = "last_workspace_id";

export interface LocalePreferenceState {
  /**
   * The GLOBAL default locale the user explicitly chose, or null if they never
   * picked. The first-run language gate keys off this (null → show the
   * picker). Per-workspace overrides do NOT affect first-run.
   */
  locale: SupportedLocale | null;
  /** True until every source has resolved AND the resolved locale is applied. */
  isLoading: boolean;
  /**
   * First-run picker write: persist the GLOBAL default (no workspace exists
   * yet) and swap the live i18n language. Later, per-workspace changes go
   * through the workspace store's `setLocale`, not this.
   */
  setLocale: (locale: SupportedLocale) => Promise<void>;
}

/**
 * Owns the full locale story for boot: it resolves the user's effective UI
 * locale from the engine — the active workspace's `locale` override winning
 * over the global `locale` preference — and applies it to the live i18n
 * instance. The engine, NOT the browser's localStorage cache, is the source of
 * truth, so a fresh browser pointed at a headless engine still shows the
 * stored language. localStorage stays a boot-time flash cache only.
 *
 * Consumed by the first-run `LanguageGate`; because that gate wraps the whole
 * app it also keeps the live language in sync as the active workspace changes.
 */
export function useLocalePreference(): LocalePreferenceState {
  const qc = useQueryClient();
  const storeCurrent = useWorkspaceStore((s) => s.current);
  const [applied, setApplied] = useState(false);

  // Global default locale preference (engine-owned).
  const globalQuery = useQuery({
    queryKey: globalKey,
    queryFn: async (): Promise<SupportedLocale | null> => {
      const raw = await tauriPreferences.get(LOCALE_PREF_KEY);
      return isSupported(raw) ? raw : null;
    },
    staleTime: 30_000,
  });

  // Boot-time active-workspace override, resolved INDEPENDENTLY of <App/> —
  // which mounts below <LanguageGate> and only then loads workspaces. Without
  // this the gate would apply the global default on the first paint and then
  // flash to the workspace override once <App/> loads. Best-effort: a failure
  // logs and resolves null (the real error surfaces via the store's
  // loadWorkspaces), so boot falls back to the global default, never blocks.
  const bootWorkspaceQuery = useQuery({
    queryKey: bootWorkspaceKey,
    queryFn: async (): Promise<string | null> => {
      try {
        const [workspaces, lastId] = await Promise.all([
          tauriWorkspaces.list(),
          tauriPreferences.get(LAST_WORKSPACE_KEY),
        ]);
        return activeWorkspaceLocale(workspaces, lastId);
      } catch (err) {
        logger.error(
          "[locale] boot workspace resolve failed",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    },
    staleTime: 30_000,
  });

  const globalLocale = globalQuery.data ?? null;
  // Once <App/> has set an active workspace it is authoritative (it reacts to
  // the user switching workspaces); before that, the boot query stands in so
  // the first paint already reflects the active workspace's override.
  const workspaceLocale = storeCurrent
    ? storeCurrent.locale ?? null
    : bootWorkspaceQuery.data ?? null;
  const effective = resolveEffectiveLocale(workspaceLocale, globalLocale);

  // Apply the engine-resolved locale to the live i18n instance, and re-apply
  // when it changes (e.g. switching into a workspace that pins a different
  // language). Applying is best-effort — the i18next detector already picked a
  // valid language — so a failure must NOT hold the gate: always un-gate in
  // `finally`, and log (never silently swallow) on error.
  useEffect(() => {
    if (globalQuery.isLoading || bootWorkspaceQuery.isLoading) return;
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
  }, [globalQuery.isLoading, bootWorkspaceQuery.isLoading, effective]);

  const mutation = useMutation({
    mutationFn: async (locale: SupportedLocale) => {
      await tauriPreferences.set(LOCALE_PREF_KEY, locale);
      await changeLocale(locale);
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

  return {
    locale: globalLocale,
    isLoading: globalQuery.isLoading || bootWorkspaceQuery.isLoading || !applied,
    setLocale,
  };
}
