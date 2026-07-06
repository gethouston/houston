import { cn } from "@houston-ai/core";
import type { OrgInfo, OrgRole } from "@houston-ai/engine-client";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import ActivityTab from "./activity-tab";
import AgentsTab from "./agents-tab";
import MembersTab from "./members-tab";
import { ORG_TAB_IDS, type OrgTabId } from "./org-view-model";
import TemplatesTab from "./templates-tab";
import UsageTab from "./usage-tab";

/**
 * The shared context every Organization tab receives. `org` is the loaded
 * `GET /org` payload (roster + invites for owner/admin); `role` is the caller's
 * org role; `isOwner` is the single mutate-everything gate the tabs read so they
 * don't each re-derive it. Defined + exported here so the four tab modules can
 * type their prop against one contract while the shell owns loading + gating.
 */
export interface OrgViewContext {
  org: OrgInfo;
  role: OrgRole;
  isOwner: boolean;
}

/** Props for every Organization tab: the shared context, nothing else. */
export interface OrgTabProps {
  ctx: OrgViewContext;
}

const TAB_COMPONENTS: Record<OrgTabId, (props: OrgTabProps) => ReactNode> = {
  people: MembersTab,
  agents: AgentsTab,
  templates: TemplatesTab,
  activity: ActivityTab,
  usage: UsageTab,
};

/**
 * The top-level Organization dashboard (Teams v2): People, Agents, Activity,
 * Usage. A shell only — it loads the org, builds the shared `OrgViewContext`,
 * and renders the active tab; each tab module owns its own data + UI so the
 * parallel UI wave fills them without touching this file.
 *
 * Rendered ONLY when `canSeeOrganization` (multiplayer owner/admin) — the
 * sidebar hides the nav entry and `workspace-shell` guards the render for
 * everyone else, so this never mounts in single-player or for a plain member.
 */
export function OrganizationView() {
  const { t } = useTranslation("teams");
  const { data: org, isLoading } = useOrg(true);
  const [tab, setTab] = useState<OrgTabId>("people");

  const ActiveTab = TAB_COMPONENTS[tab];
  const ctx: OrgViewContext | null = org
    ? { org, role: org.role, isOwner: org.role === "owner" }
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-8 pt-10 pb-2">
          <div>
            <h1 className="text-[28px] font-normal text-foreground">
              {t("org.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("org.subtitle")}
            </p>
          </div>
          <div
            role="tablist"
            aria-label={t("org.tablistLabel")}
            className="flex items-center gap-5"
          >
            {ORG_TAB_IDS.map((id) => {
              const isActive = tab === id;
              return (
                <button
                  type="button"
                  role="tab"
                  key={id}
                  id={`org-tab-${id}`}
                  aria-selected={isActive}
                  aria-controls="org-tabpanel"
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative rounded-sm pb-2.5 text-sm transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`org.tabs.${id}`)}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div
          role="tabpanel"
          id="org-tabpanel"
          aria-labelledby={`org-tab-${tab}`}
          className="mx-auto w-full max-w-5xl px-8 pb-10"
        >
          {ctx ? (
            <ActiveTab ctx={ctx} />
          ) : (
            <p className="py-10 text-sm text-muted-foreground">
              {isLoading ? t("org.loading") : t("org.unavailable")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
