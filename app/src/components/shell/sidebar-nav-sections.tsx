import type { SidebarNavSection } from "@houston-ai/layout";
import { Blocks, Store } from "lucide-react";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view";
import { STORE_VIEW_ID } from "../store-view";
import type { SidebarChromeT } from "./sidebar-chrome";
import { gatedNavRows } from "./sidebar-nav-rows";
import { tourAnchor } from "./workspace-tour-steps.ts";

/** One labelled band's persisted fold, exactly as "Your teams" carries it. */
export interface SectionFold {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * The rail's top-level destinations, in three runs above "Your teams".
 *
 * 1. **Unlabelled** — the Assistant and the Agent Store. Who you ask for
 *    anything, and where agents come from: the things a user reaches for
 *    without being asked, so they lead the rail and need no heading over them.
 *    The Assistant leads the run because it is the one row that answers a
 *    question the user has not worked out how to ask yet; it is the only row
 *    gated on DISCOVERY rather than on a role, and it is absent where no
 *    assistant exists.
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
 * Five things a reader may come looking for live elsewhere, each on purpose.
 * Per-agent policy is every team's focused agent screen, discovered through
 * the team that owns the agent. Time worked is a section inside Admin, beside
 * the activity feed and usage bars it is read against. About me is a Settings
 * section: what the agents know about the person is a standing preference,
 * kept with their name and their language. "Guide me" is one of two items
 * behind the help control in the rail's footer (`sidebar-help-menu.tsx`),
 * because it points at no screen. The Academy and Settings are the rail's
 * FOOTER cluster (`sidebar-footer.tsx`): learning to fly and the person's own
 * chrome sit under the space's contents rather than above them, and both must
 * stay reachable in the deployments where the Workspace band does not exist.
 */
export function buildSidebarNavItems(args: {
  t: SidebarChromeT;
  showAiModels: boolean;
  /** The Admin row, per `useSurfaceGates`. */
  showOrganization: boolean;
  /** The Skills row: the SPACE OWNER's, per `useSurfaceGates`. */
  showSkills: boolean;
  /** The Assistant row: true where discovery hands out an address for one. */
  showAssistant: boolean;
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
    showAssistant,
    folds,
    setViewMode,
  } = args;
  const { assistant, organization, skills, aiModels } = gatedNavRows({
    t,
    setViewMode,
  });
  return [
    {
      id: "primary",
      items: [
        ...(showAssistant ? [assistant] : []),
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
