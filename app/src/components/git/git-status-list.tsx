/**
 * `<GitStatusList />` — the staged + unstaged + untracked file list as
 * returned by `git status --porcelain=v1`. Read-only in v1; clicking a
 * row notifies the parent so it can drive the diff viewer.
 *
 * Phase 3 of RFC #248 (`advanced.git_panel`). The two-char porcelain
 * code is decoded into a human-readable category via the locale
 * `git.statusCode.*` keys.
 */
import { useTranslation } from "react-i18next";
import type { GitStatusEntry, GitStatusResponse } from "@houston-ai/engine-client";

interface Props {
  status: GitStatusResponse;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function GitStatusList({ status, selectedPath, onSelect }: Props) {
  const { t } = useTranslation("git");

  if (status.entries.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        {t("status.cleanTree")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {status.entries.map((entry) => (
        <StatusRow
          key={entry.path}
          entry={entry}
          selected={selectedPath === entry.path}
          onSelect={() => onSelect(entry.path)}
        />
      ))}
    </ul>
  );
}

function StatusRow({
  entry,
  selected,
  onSelect,
}: {
  entry: GitStatusEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("git");
  const label = decodeCode(entry.code, t);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full flex items-center gap-3 px-4 py-1.5 text-left text-xs hover:bg-accent transition-colors ${
          selected ? "bg-accent" : ""
        }`}
      >
        <span className={`w-16 shrink-0 font-medium ${codeColor(entry.code)}`}>
          {label}
        </span>
        <span className="truncate font-mono">{entry.path}</span>
        {entry.origPath && (
          <span className="text-muted-foreground">← {entry.origPath}</span>
        )}
      </button>
    </li>
  );
}

function decodeCode(code: string, t: (k: string) => string): string {
  // Porcelain code is XY: index-state then worktree-state. We surface the
  // most user-facing meaning, biasing toward the worktree column when both
  // exist (matches how `git status` itself reads).
  if (code === "??") return t("statusCode.untracked");
  if (code.startsWith("A")) return t("statusCode.added");
  if (code.startsWith("D") || code[1] === "D") return t("statusCode.deleted");
  if (code.startsWith("R")) return t("statusCode.renamed");
  if (code.startsWith("C")) return t("statusCode.copied");
  if (code.startsWith("M") || code[1] === "M") return t("statusCode.modified");
  return code.trim();
}

function codeColor(code: string): string {
  if (code === "??") return "text-muted-foreground";
  if (code.startsWith("A")) return "text-green-500";
  if (code.startsWith("D") || code[1] === "D") return "text-red-500";
  return "text-yellow-500";
}
