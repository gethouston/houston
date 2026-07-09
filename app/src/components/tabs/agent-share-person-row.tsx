import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShareAction, SharePerson } from "./agent-access-model";

function initial(person: SharePerson): string {
  const source = person.email ?? person.userId;
  return source.trim().charAt(0).toUpperCase() || "?";
}

/**
 * One row in the Share dialog's people list. The org owner renders as a static
 * "Owner, always has access" (non-editable). Everyone else gets a dropdown with
 * Manager / Can use / Remove; the Manager option is disabled with an inline
 * reason for teammates who don't hold a Manager seat (`canBeManager` false).
 *
 * `readOnly` renders every row as static text (access level, no controls) — the
 * shape a plain member sees in the read-only "who has access" view, where no
 * management is permitted. `onAction` is never called in that mode.
 */
export function AgentSharePersonRow({
  person,
  avatarUrl,
  disabled,
  readOnly,
  onAction,
}: {
  person: SharePerson;
  /** Resolved avatar photo (uploaded/provider), or null for initials-only. */
  avatarUrl?: string | null;
  /** Locks the control while a write is in flight. */
  disabled?: boolean;
  /** Render the access level as static text with no controls. */
  readOnly?: boolean;
  onAction?: (action: ShareAction) => void;
}) {
  const { t } = useTranslation("teams");
  const name = person.email ?? person.userId;
  const levelLabel =
    person.access === "manager"
      ? t("share.levels.manager")
      : t("share.levels.user");

  return (
    <li className="flex items-center gap-3 rounded-xl border border-foreground/5 bg-card px-3 py-2.5">
      <Avatar size="sm">
        {avatarUrl && (
          <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback>{initial(person)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">
          {name}
          {person.isSelf && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {t("share.you")}
            </span>
          )}
        </div>
      </div>

      {person.isOwner ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("share.ownerAccess")}
        </span>
      ) : readOnly ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {levelLabel}
        </span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-label={t("share.changeAccessFor", { name })}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
          >
            <span>{levelLabel}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              disabled={!person.canBeManager}
              onSelect={() => onAction?.("manager")}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.manager")}</span>
                  {person.access === "manager" && (
                    <Check className="size-3.5" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {person.canBeManager
                    ? t("share.levels.managerHint")
                    : t("share.managerRequiresSeat")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction?.("user")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.user")}</span>
                  {person.access === "user" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("share.levels.userHint")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onAction?.("remove")}
            >
              {t("share.remove")}
            </DropdownMenuItem>
            {person.isSelf && (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("share.selfNote")}
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
