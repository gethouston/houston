/**
 * `<GitPanel />` — the read-only git inspector that mounts when the
 * `advanced.git_panel` flag is on AND the agent's cwd is a git repo.
 *
 * Layout: two-pane. Left pane has tabs (Status | Log); selecting a
 * row in the Status pane drives the right pane (diff viewer).
 *
 * Phase 3 of RFC #248. Uses `useIsGitRepo` for the empty-state guard
 * so non-repo cwds get a graceful message instead of a toast cascade.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGitDiff,
  useGitLog,
  useGitStatus,
  useIsGitRepo,
} from "../../hooks/use-git-queries";
import { GitStatusList } from "./git-status-list";
import { GitLogList } from "./git-log-list";
import { GitDiffViewer } from "./git-diff-viewer";

interface Props {
  cwd: string;
}

type LeftTab = "status" | "log";

export function GitPanel({ cwd }: Props) {
  const { t } = useTranslation("git");
  const isRepo = useIsGitRepo(cwd);
  const [leftTab, setLeftTab] = useState<LeftTab>("status");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  if (isRepo.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  if (!isRepo.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-2">
        <h3 className="text-base font-semibold">{t("notARepo.title")}</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {t("notARepo.description")}
        </p>
        <p className="text-xs text-muted-foreground/70 font-mono truncate max-w-md">
          {cwd}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left pane */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="flex border-b border-border">
          <TabButton
            active={leftTab === "status"}
            onClick={() => setLeftTab("status")}
            label={t("tabs.status")}
          />
          <TabButton
            active={leftTab === "log"}
            onClick={() => setLeftTab("log")}
            label={t("tabs.log")}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {leftTab === "status" ? (
            <StatusPane
              cwd={cwd}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          ) : (
            <LogPane cwd={cwd} />
          )}
        </div>
      </div>
      {/* Right pane */}
      <div className="flex-1 overflow-auto">
        <DiffPane cwd={cwd} path={selectedPath} />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "text-foreground border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function StatusPane({
  cwd,
  selectedPath,
  onSelect,
}: {
  cwd: string;
  selectedPath: string | null;
  onSelect: (p: string) => void;
}) {
  const { t } = useTranslation("git");
  const q = useGitStatus(cwd);
  if (q.isLoading) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">{t("loading")}</div>;
  }
  if (!q.data) {
    return null;
  }
  return (
    <>
      {q.data.branch && (
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
          {t("status.onBranch", { branch: q.data.branch })}
        </div>
      )}
      <GitStatusList
        status={q.data}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </>
  );
}

function LogPane({ cwd }: { cwd: string }) {
  const { t } = useTranslation("git");
  const q = useGitLog(cwd);
  if (q.isLoading) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">{t("loading")}</div>;
  }
  if (!q.data) return null;
  return <GitLogList log={q.data} />;
}

function DiffPane({ cwd, path }: { cwd: string; path: string | null }) {
  const { t } = useTranslation("git");
  const q = useGitDiff(cwd, path);
  if (!path) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-6 text-center">
        {t("diff.selectAFile")}
      </div>
    );
  }
  if (q.isLoading) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">{t("loading")}</div>;
  }
  if (!q.data) return null;
  return (
    <div className="p-4">
      <div className="text-xs font-mono text-muted-foreground mb-2">{path}</div>
      <GitDiffViewer diff={q.data.diff} />
    </div>
  );
}
