import type {
  SidebarNavItemEntry,
  SidebarNavSection,
} from "@houston-ai/layout";
import {
  Blocks,
  Boxes,
  Building2,
  Inbox,
  LibraryBig,
  Store,
  UserRound,
} from "lucide-react";
import {
  ABOUT_ME_VIEW_ID,
  AI_HUB_VIEW_ID,
  INBOX_VIEW_ID,
  ORGANIZATION_VIEW_ID,
} from "../../lib/top-level-views";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view";
import { useOrgNav } from "../organization/org-nav-store.ts";
import { DEFAULT_ORG_TAB } from "../organization/org-view-model.ts";
import { SKILLS_VIEW_ID } from "../skills-view/id";
import { STORE_VIEW_ID } from "../store-view";
import type { SidebarChromeT } from "./sidebar-chrome";
import { buildInboxBadge } from "./sidebar-inbox-badge";
import { tourAnchor } from "./workspace-tour-steps.ts";

/** One labelled band's persisted fold, exactly as "Your teams" carries it. */
export interface SectionFold {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * The rail's top-level destinations, in three runs above "Your teams".
 *
 * 1. **Unlabelled** — the Inbox, About me and the Agent Store. Where work
 *    arrives, what every agent knows about you before it starts, and where
 *    agents come from: the things a user reaches for without being asked, so
 *    they lead the rail and need no heading over them. About me is everyone's,
 *    in every deployment, and deliberately not gated: standing context about
 *    the person is not a preference and belongs to nobody's admin territory.
 * 2. **"My accounts"** — the connections that belong to the PERSON: the apps
 *    they have OAuthed and the AI accounts they run their turns on. Nobody
 *    else in the space is affected by either.
 * 3. **"Workspace"** — what the SPACE is made of, which makes the whole band
 *    owner territory rather than everyone's: Admin (`showOrganization`) and the
 *    shared Skills library (`showSkills`, the space owner's). An org admin
 *    therefore sees Admin; a plain member passes neither gate and sees no
 *    Workspace band at all.
 *
 * A section the gates empty is DROPPED by the library, band and all
 * (`SidebarNavList` filters on `items.length`), so a heading can never outlive
 * the rows it names — which is the ONE rule, and why nothing here needs a
 * second one asking whether a run came out empty.
 *
 * Two rows this band used to carry are gone. **Permissions** listed the space's
 * agents so an admin could open one's settings page, which is what every team's
 * "Manage agents" section already does, per team, in every deployment — one
 * door onto agent policy, discovered through the team that owns the agent,
 * instead of two that had to be kept in agreement. **Time worked** is a lens
 * inside Admin > Analytics now, beside the activity feed and the usage bars it
 * was always read against.
 *
 * **"Guide me" is not here either**: it never pointed at a screen, so a
 * permanent destination row was the wrong shape for it. It is one of two items
 * behind the help control in the rail's footer (`sidebar-help-menu.tsx`).
 *
 * Settings is NOT here: it is a permanent footer row beside the help control,
 * because it belongs to the PERSON's chrome rather than to what the space is
 * made of, and must stay reachable in the deployments where this band does not
 * exist.
 */
export function buildSidebarNavItems(args: {
  t: SidebarChromeT;
  showAiModels: boolean;
  /** The Admin row, per `useSurfaceGates`. */
  showOrganization: boolean;
  /** The Skills row: the SPACE OWNER's, per `useSurfaceGates`. */
  showSkills: boolean;
  /** Unread @mentions of the viewer. Zero draws no badge. */
  mentionCount: number;
  /** The persisted fold of each LABELLED band, and its toggle. Same shape and
   *  same persistence as "Your teams" below them: one band anatomy, one rule. */
  folds: {
    myAccounts: SectionFold;
    workspace: SectionFold;
  };
  setViewMode: (view: string) => void;
}): SidebarNavSection[] {
  const {
    t,
    showAiModels,
    showOrganization,
    showSkills,
    mentionCount,
    folds,
    setViewMode,
  } = args;
  const organization: SidebarNavItemEntry = {
    id: ORGANIZATION_VIEW_ID,
    label: t("settings:nav.organization"),
    icon: <Building2 className="h-4 w-4" />,
    onClick: () => {
      // The rail rule: a rail door always opens its screen's HOME, never the
      // kept-alive leftover (a team row opens its board, the footer's
      // Settings opens the index via `openSettings(null)`). Admin's home is
      // its landing section, pinned through the same one-shot store the
      // Billing deep link uses — which also backs out of a drilled section
      // like Analytics when the screen is already open.
      useOrgNav.getState().requestTab(DEFAULT_ORG_TAB);
      setViewMode(ORGANIZATION_VIEW_ID);
    },
  };
  const skills: SidebarNavItemEntry = {
    id: SKILLS_VIEW_ID,
    label: t("shell:sidebar.skills"),
    icon: <LibraryBig className="h-4 w-4" />,
    onClick: () => setViewMode(SKILLS_VIEW_ID),
    dataAttrs: tourAnchor("nav-skills"),
  };
  const aiModels: SidebarNavItemEntry = {
    id: AI_HUB_VIEW_ID,
    label: t("shell:sidebar.aiModels"),
    icon: <Boxes className="h-4 w-4" />,
    onClick: () => setViewMode(AI_HUB_VIEW_ID),
    dataAttrs: tourAnchor("nav-ai-hub"),
  };
  return [
    {
      id: "primary",
      items: [
        {
          id: INBOX_VIEW_ID,
          label: t("shell:sidebar.inbox"),
          icon: <Inbox className="h-4 w-4" />,
          onClick: () => setViewMode(INBOX_VIEW_ID),
          dataAttrs: tourAnchor("nav-inbox"),
          trailing: buildInboxBadge(t, mentionCount),
        },
        {
          id: ABOUT_ME_VIEW_ID,
          label: t("shell:sidebar.aboutMe"),
          icon: <UserRound className="h-4 w-4" />,
          // No tour anchor: the tour does not walk this row, exactly as it
          // does not walk Admin or Skills. A target in the anchor union that no
          // step spotlights is dead weight the union exists to prevent.
          onClick: () => setViewMode(ABOUT_ME_VIEW_ID),
        },
        {
          id: STORE_VIEW_ID,
          label: t("shell:sidebar.agentStore"),
          icon: <Store className="h-4 w-4" />,
          onClick: () => setViewMode(STORE_VIEW_ID),
          dataAttrs: tourAnchor("nav-agent-store"),
        },
      ],
    },
    {
      id: "my-accounts",
      label: t("shell:sidebar.myAccounts"),
      collapsed: folds.myAccounts.collapsed,
      onToggleCollapsed: folds.myAccounts.onToggle,
      items: [
        {
          id: INTEGRATIONS_VIEW_ID,
          label: t("shell:sidebar.integrations"),
          icon: <Blocks className="h-4 w-4" />,
          onClick: () => setViewMode(INTEGRATIONS_VIEW_ID),
          dataAttrs: tourAnchor("nav-integrations"),
        },
        ...(showAiModels ? [aiModels] : []),
      ],
    },
    {
      id: "workspace",
      label: t("shell:sidebar.workspace"),
      collapsed: folds.workspace.collapsed,
      onToggleCollapsed: folds.workspace.onToggle,
      items: [
        ...(showOrganization ? [organization] : []),
        ...(showSkills ? [skills] : []),
      ],
    },
  ];
}
