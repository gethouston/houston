/**
 * Advanced settings section.
 *
 * Phase 0 ships this with `FLAG_REGISTRY` empty, so the section renders an
 * empty-state placeholder and a disabled "Reset all" button. Subsequent
 * phases each add one entry to the registry; this component then iterates
 * `Object.values(FLAG_REGISTRY)` to render a toggle row per flag with
 * label / description / switch wired through `useFeatureFlagToggle`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@houston-ai/core";
import { tauriPreferences } from "../../../lib/tauri";
import {
  FLAG_REGISTRY,
  flagToString,
  getFlagDefault,
  stringToFlag,
  type FlagDef,
} from "../../../lib/featureFlags";

export function AdvancedSection() {
  const { t } = useTranslation("settings");
  const flags = Object.values(FLAG_REGISTRY);
  const isEmpty = flags.length === 0;
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("advanced.title")}</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("advanced.description")}
      </p>

      {isEmpty ? (
        <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          {t("advanced.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {flags.map((flag) => (
            <FlagRow key={flag.key} flag={flag} />
          ))}
        </ul>
      )}

      <div className="mt-8 pt-6 border-t border-border">
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          disabled={isEmpty}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t("advanced.resetAll")}
        </button>
      </div>

      {confirmingReset && !isEmpty && (
        <ResetAllDialog onClose={() => setConfirmingReset(false)} />
      )}
    </section>
  );
}

/**
 * A single flag toggle row. TanStack Query `useMutation` with optimistic
 * update + rollback on error. `tauriPreferences.set` surfaces its own
 * toast on failure via the `call()` wrapper in `tauri.ts`, so the
 * mutation only needs to handle the cache rollback.
 */
function FlagRow({ flag }: { flag: FlagDef }) {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();
  const queryKey = ["preference", flag.key] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => tauriPreferences.get(flag.key),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      await tauriPreferences.set(flag.key, flagToString(next));
      return next;
    },
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<string | null>(queryKey);
      qc.setQueryData<string | null>(queryKey, flagToString(next));
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx) qc.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const stored = stringToFlag(query.data);
  const enabled = stored ?? getFlagDefault(flag.key);

  return (
    <li className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">
            {t(flag.labelKey as never)}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(flag.descriptionKey as never)}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(next) => mutation.mutate(next)}
          disabled={mutation.isPending}
          aria-label={t(flag.labelKey as never)}
        />
      </div>
    </li>
  );
}

/**
 * "Reset all" confirmation. Wipes every advanced.* key by writing the empty
 * string back to storage (preferences route has no DELETE handler today; an
 * empty string is parsed as unset by `stringToFlag`, falling through to the
 * code default — which is the desired reset behavior).
 */
function ResetAllDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const qc = useQueryClient();
  const flags = Object.values(FLAG_REGISTRY);

  const mutation = useMutation({
    mutationFn: async () => {
      for (const flag of flags) {
        await tauriPreferences.set(flag.key, "");
      }
    },
    onSuccess: () => {
      for (const flag of flags) {
        void qc.invalidateQueries({ queryKey: ["preference", flag.key] });
      }
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg">
        <h3 className="text-base font-semibold mb-1">
          {t("advanced.resetConfirmTitle")}
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          {t("advanced.resetConfirmDescription")}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {t("advanced.resetConfirmLabel")}
          </button>
        </div>
      </div>
    </div>
  );
}
