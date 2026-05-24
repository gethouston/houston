/**
 * `<GitLogList />` — recent commits from `git log`. Each row shows
 * short sha, subject, author, and relative date.
 *
 * Phase 3 of RFC #248 (`advanced.git_panel`). Read-only.
 */
import { useTranslation } from "react-i18next";
import type { GitLogResponse } from "@houston-ai/engine-client";

interface Props {
  log: GitLogResponse;
}

export function GitLogList({ log }: Props) {
  const { t, i18n } = useTranslation("git");

  if (log.commits.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        {t("log.noCommits")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {log.commits.map((commit) => (
        <li
          key={commit.sha}
          className="px-4 py-2 text-xs border-b border-border/30 last:border-b-0"
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-muted-foreground">
              {commit.sha.slice(0, 7)}
            </span>
            <span className="truncate flex-1">{commit.subject}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {commit.author} · {formatRelative(commit.date, i18n.language)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string, locale: string): string {
  // Best-effort relative time using Intl. Falls back to the ISO date if
  // anything blows up (bad input from a future git version, etc.).
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
    const diffYear = Math.round(diffMonth / 12);
    return fmt.format(diffYear, "year");
  } catch {
    return iso;
  }
}
