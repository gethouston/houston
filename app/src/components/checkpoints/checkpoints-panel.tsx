/**
 * `<CheckpointsPanel />` — snapshot + restore agent `.houston/` state.
 * Phase 5 of RFC #248 / `advanced.checkpoints`.
 *
 * Top row: name input + Create button. Below: chronological list
 * (newest first) with Restore + Delete actions per checkpoint, both
 * gated by a destructive ConfirmDialog.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Checkpoint } from "@houston-ai/engine-client";
import {
  useCheckpoints,
  useCreateCheckpoint,
  useDeleteCheckpoint,
  useRestoreCheckpoint,
} from "../../hooks/use-checkpoints";
import { ConfirmDialog } from "./confirm-dialog";

interface Props {
  agentPath: string;
}

export function CheckpointsPanel({ agentPath }: Props) {
  const { t, i18n } = useTranslation("checkpoints");
  const list = useCheckpoints(agentPath);
  const create = useCreateCheckpoint(agentPath);
  const restore = useRestoreCheckpoint(agentPath);
  const del = useDeleteCheckpoint(agentPath);
  const [name, setName] = useState("");
  const [pendingRestore, setPendingRestore] = useState<Checkpoint | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Checkpoint | null>(null);

  const checkpoints = list.data?.checkpoints ?? [];

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await create.mutateAsync(trimmed);
    setName("");
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder={t("create.placeholder")}
          className="flex-1 rounded-md border border-border/30 bg-secondary px-3 py-2 text-sm outline-none hover:border-border/60 focus:border-border"
        />
        <button
          type="button"
          disabled={create.isPending || !name.trim()}
          onClick={() => void handleCreate()}
          className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {create.isPending ? t("create.saving") : t("create.button")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {list.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t("loading")}</div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-1">
            <h3 className="text-base font-semibold">{t("empty.title")}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {t("empty.description")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/30">
            {checkpoints.map((cp) => (
              <CheckpointRow
                key={cp.id}
                cp={cp}
                locale={i18n.language}
                onRestore={() => setPendingRestore(cp)}
                onDelete={() => setPendingDelete(cp)}
              />
            ))}
          </ul>
        )}
      </div>
      {pendingRestore && (
        <ConfirmDialog
          title={t("restore.confirmTitle")}
          description={t("restore.confirmDescription", { name: pendingRestore.name })}
          confirmLabel={t("restore.confirmLabel")}
          variant="destructive"
          onClose={() => setPendingRestore(null)}
          onConfirm={() => restore.mutateAsync(pendingRestore.id)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("delete.confirmTitle")}
          description={t("delete.confirmDescription", { name: pendingDelete.name })}
          confirmLabel={t("delete.confirmLabel")}
          variant="destructive"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => del.mutateAsync(pendingDelete.id)}
        />
      )}
    </div>
  );
}

function CheckpointRow({
  cp,
  locale,
  onRestore,
  onDelete,
}: {
  cp: Checkpoint;
  locale: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("checkpoints");
  return (
    <li className="px-4 py-3 hover:bg-accent/40 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground truncate">{cp.name}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatRelative(cp.createdAt, locale)} · {formatBytes(cp.sizeBytes)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRestore}
            className="text-xs px-2 py-1 rounded-md text-foreground hover:bg-accent transition-colors"
          >
            {t("actions.restore")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs px-2 py-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors"
          >
            {t("actions.delete")}
          </button>
        </div>
      </div>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelative(iso: string, locale: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60_000);
    const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (Math.abs(diffMin) < 60) return fmt.format(diffMin, "minute");
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) return fmt.format(diffHour, "hour");
    const diffDay = Math.round(diffHour / 24);
    if (Math.abs(diffDay) < 30) return fmt.format(diffDay, "day");
    const diffMonth = Math.round(diffDay / 30);
    if (Math.abs(diffMonth) < 12) return fmt.format(diffMonth, "month");
    return fmt.format(Math.round(diffMonth / 12), "year");
  } catch {
    return iso;
  }
}
