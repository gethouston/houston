import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  resolveAgentColor,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import type { ShareAction } from "../tabs/agent-access-model.ts";
import type { MemberAccessLevel } from "./member-detail-model.ts";

/** How a member's row on one agent should render (decided by the screen). */
export type MemberAgentRowKind = "everyone" | "owner" | "readOnly" | "editable";

/** The translated label for a member's current access level. */
function levelLabel(
  access: MemberAccessLevel,
  t: (k: string) => string,
): string {
  switch (access) {
    case "manager":
      return t("share.levels.manager");
    case "user":
      return t("share.levels.user");
    case "unknown":
      return t("org.memberDetail.access.unknown");
    default:
      return t("org.memberDetail.access.none");
  }
}

/**
 * One agent row in the per-member access lens. The left side is the agent's
 * identity; the right side depends on `kind`:
 * - `everyone` — a static "Everyone in the team" note (org-wide agents are never
 *   converted to an explicit roster from this view).
 * - `owner` — a static "Owner, always has access" note (the org owner can never
 *   be removed from any agent).
 * - `readOnly` — the level as static text (an agent the viewer can't manage).
 * - `editable` — a Manager / Can use / No access dropdown; Manager is disabled
 *   with an inline reason for members without a Manager seat.
 *
 * The trigger shows the current level at rest (no hover gating); `onAction` is
 * only wired in the `editable` kind.
 */
export function MemberAgentRow({
  agent,
  access,
  kind,
  canBeManager,
  disabled,
  onAction,
}: {
  agent: Pick<Agent, "name" | "color">;
  access: MemberAccessLevel;
  kind: MemberAgentRowKind;
  canBeManager: boolean;
  disabled?: boolean;
  onAction?: (action: ShareAction) => void;
}) {
  const { t } = useTranslation("teams");
  const label = levelLabel(access, t);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-ink/5 bg-card px-4 py-3">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: resolveAgentColor(agent.color) }}
      />
      <div className="min-w-0 flex-1 truncate text-sm text-ink">
        {agent.name}
      </div>

      {kind === "everyone" ? (
        <span className="shrink-0 text-xs text-ink-muted">
          {t("org.memberDetail.everyone.note")}
        </span>
      ) : kind === "owner" ? (
        <span className="shrink-0 text-xs text-ink-muted">
          {t("share.ownerAccess")}
        </span>
      ) : kind === "readOnly" ? (
        <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-label={t("org.memberDetail.changeAccess", {
              agent: agent.name,
            })}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-sm text-ink hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:opacity-50"
          >
            <span>{label}</span>
            <ChevronDown className="size-3.5 text-ink-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              disabled={!canBeManager}
              onSelect={() => onAction?.("manager")}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.manager")}</span>
                  {access === "manager" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {canBeManager
                    ? t("share.levels.managerHint")
                    : t("share.managerRequiresSeat")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction?.("user")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.user")}</span>
                  {access === "user" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {t("share.levels.userHint")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction?.("remove")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("org.memberDetail.access.none")}</span>
                  {access === "none" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {t("org.memberDetail.access.noneHint")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuLabel className="text-xs font-normal text-ink-muted">
              {t("org.memberDetail.setReplaceNote")}
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
