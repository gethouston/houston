import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShareAction } from "../agent/agent-access-model.ts";
import { rosterPersonName } from "../organization/people-tab-model.ts";
import {
  PersonRow,
  personRowTriggerClass,
} from "../organization/person-row.tsx";
import type { AgentPersonRow as Row } from "./agent-people-model.ts";

function levelLabel(level: Row["level"], t: (k: string) => string): string {
  if (level === "manager") return t("share.levels.manager");
  if (level === "user") return t("share.levels.user");
  return t("permissions.agentPeople.none");
}

export function AgentPersonRow({
  row,
  avatarUrl,
  disabled,
  readOnly,
  onAction,
}: {
  row: Row;
  avatarUrl?: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  onAction: (action: ShareAction) => void;
}) {
  const { t } = useTranslation("teams");
  const name = rosterPersonName(row.member, t("people.roster.unnamedAccount"));
  const label = levelLabel(row.level, t);

  return (
    <PersonRow
      name={name}
      avatarUrl={avatarUrl}
      isSelf={row.isSelf}
      selfLabel={t("share.you")}
      secondary={t(`people.roles.${row.member.role}`)}
    >
      {row.isOwner ? (
        <span className="shrink-0 text-[13px] text-ink-muted">
          {t("share.ownerAccess")}
        </span>
      ) : readOnly ? (
        <span className="shrink-0 text-sm text-ink-muted">{label}</span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-label={t("permissions.agentPeople.changeAccess", { name })}
            className={personRowTriggerClass}
          >
            <span>{label}</span>
            <ChevronDown className="size-3.5 text-ink-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              disabled={!row.canBeManager}
              onSelect={() => onAction("manager")}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.manager")}</span>
                  {row.level === "manager" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {row.canBeManager
                    ? t("share.levels.managerHint")
                    : t("share.managerRequiresSeat")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("user")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.user")}</span>
                  {row.level === "user" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {t("share.levels.userHint")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction("remove")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("permissions.agentPeople.none")}</span>
                  {row.level === "none" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {t("permissions.agentPeople.noneHint")}
                </p>
              </div>
            </DropdownMenuItem>
            {row.isSelf && (
              <DropdownMenuLabel className="text-xs font-normal text-ink-muted">
                {t("share.selfNote")}
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </PersonRow>
  );
}
