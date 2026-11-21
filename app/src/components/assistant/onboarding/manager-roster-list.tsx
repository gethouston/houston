import {
  Button,
  HoustonAvatar,
  resolveAgentColor,
  Spinner,
} from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface RosterRow {
  key: string;
  name: string;
  role: string;
  color: string | undefined;
  status: "draft" | "joining" | "hired" | "failed";
  problem: string | null;
  onRetry?: () => void;
  onRemove?: () => void;
}

export function ManagerRosterList({ rows }: { rows: readonly RosterRow[] }) {
  const { t } = useTranslation(["assistant", "common"]);
  return (
    <ul className="flex flex-col gap-1" data-testid="manager-roster">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex flex-col gap-2 rounded-xl px-2.5 py-2"
          data-status={row.status}
        >
          <div className="flex min-w-0 items-center gap-3">
            <HoustonAvatar color={resolveAgentColor(row.color)} diameter={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{row.name}</p>
              <p className="truncate text-xs text-ink-muted">{row.role}</p>
            </div>
            <HireStatus status={row.status} />
          </div>
          {row.problem ? (
            <div className="flex flex-col gap-2 pl-11 md:flex-row md:items-center">
              <p role="alert" className="flex-1 text-xs text-danger-ink">
                {row.problem}
              </p>
              {row.onRetry || row.onRemove ? (
                <div className="flex gap-2">
                  {row.onRemove ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-11 flex-1 rounded-full md:h-8 md:flex-none"
                      onClick={row.onRemove}
                    >
                      {t("common:actions.remove")}
                    </Button>
                  ) : null}
                  {row.onRetry ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-11 flex-1 rounded-full md:h-8 md:flex-none"
                      onClick={row.onRetry}
                    >
                      {t("common:actions.tryAgain")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function HireStatus({ status }: { status: RosterRow["status"] }) {
  const { t } = useTranslation("assistant");
  if (status === "joining")
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
        <Spinner className="size-3.5" aria-hidden="true" />
        {t("onboarding.roster.joining")}
      </span>
    );
  if (status === "hired")
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
        <Check className="size-4 text-success-ink" aria-hidden="true" />
        {t("onboarding.roster.hired")}
      </span>
    );
  return null;
}
