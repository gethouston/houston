import type { SidebarNavSection } from "@houston-ai/layout";
import { Blocks } from "lucide-react";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view";
import type { SidebarChromeT } from "./sidebar-chrome";
import { gatedNavRows } from "./sidebar-nav-rows";
import { tourAnchor } from "./workspace-tour-steps.ts";

/**
 * The rail's top-level destinations: ONE unlabelled run above "Your teams".
 *
 * The Assistant, AI Models, Integrations and Skills are the things a user
 * reaches for without being asked, so they lead the rail and need no heading
 * over them. The Assistant leads because it is the one row that answers a
 * question the user has not worked out how to ask yet; it is the only row
 * gated on DISCOVERY rather than on a role, and it is absent where no
 * assistant exists. Skills follows Integrations because the two answer the
 * same question from either side — what an agent can REACH, and what an agent
 * can DO — and it rides the `showSkills` gate, since editing a skill edits
 * every agent in the space at once. "Your teams" is the rail's only labelled
 * band, drawn below by the teams model.
 *
 * A section the gates empty is DROPPED by the library, band and all
 * (`SidebarNavList` filters on `items.length`), so a heading can never outlive
 * the rows it names.
 *
 * Four things a reader may come looking for live elsewhere, each on purpose.
 * Per-agent policy is every team's focused agent screen, discovered through
 * the team that owns the agent. Workspace management — members, roles, the
 * activity feed, time worked, the org chart — is a Settings section
 * (`openSettings("workspace")`), because administering the space is a standing
 * preference rather than a place work happens. About me is a Settings section
 * as well: what the agents know about the person is kept with their name and
 * their language. "Report a problem" sits behind the help control in the
 * rail's footer (`sidebar-help-menu.tsx`), because it points at no screen.
 * The Academy and Settings are the rail's FOOTER cluster
 * (`sidebar-footer.tsx`): learning to fly and the person's own chrome sit
 * under the space's contents rather than above them.
 */
export function buildSidebarNavItems(args: {
  t: SidebarChromeT;
  showAiModels: boolean;
  /** The Assistant row: false only where discovery settled that none exists. */
  showAssistant: boolean;
  /** The Skills row: the space owner's, whose agents a skill edit reaches. */
  showSkills: boolean;
  setViewMode: (view: string) => void;
}): SidebarNavSection[] {
  const { t, showAiModels, showAssistant, showSkills, setViewMode } = args;
  const { assistant, aiModels, skills } = gatedNavRows({ t, setViewMode });
  return [
    {
      id: "primary",
      items: [
        ...(showAssistant ? [assistant] : []),
        ...(showAiModels ? [aiModels] : []),
        {
          id: INTEGRATIONS_VIEW_ID,
          label: t("shell:sidebar.integrations"),
          icon: <Blocks className="h-4 w-4" />,
          onClick: () => setViewMode(INTEGRATIONS_VIEW_ID),
          dataAttrs: tourAnchor("nav-integrations"),
        },
        ...(showSkills ? [skills] : []),
      ],
    },
  ];
}
