import type { SidebarNavItemEntry } from "@houston-ai/layout";
import { Boxes, Building2, LibraryBig } from "lucide-react";
import {
  AI_HUB_VIEW_ID,
  ORGANIZATION_VIEW_ID,
} from "../../lib/top-level-views";
import { HoustonLogo } from "../assistant/houston-logo";
import { ASSISTANT_VIEW_ID } from "../assistant/id";
import { useOrgNav } from "../organization/org-nav-store.ts";
import { DEFAULT_ORG_TAB } from "../organization/org-view-model.ts";
import { SKILLS_VIEW_ID } from "../skills-view/id";
import type { SidebarChromeT } from "./sidebar-chrome";
import { tourAnchor } from "./workspace-tour-steps.ts";

/** The rail's GATED rows, keyed by the gate each one rides. */
export interface GatedNavRows {
  /** `showAssistant` — the personal assistant, leading the unlabelled run. */
  assistant: SidebarNavItemEntry;
  /** `showOrganization` — Admin, the "Workspace" band's lead row. */
  organization: SidebarNavItemEntry;
  /** `showSkills` — the shared Skills library, the space owner's. */
  skills: SidebarNavItemEntry;
  /** `showAiModels` — the AI Models hub, in "My accounts". */
  aiModels: SidebarNavItemEntry;
}

/**
 * The rows a gate can take away, built apart from the runs that compose them
 * (`sidebar-nav-sections.tsx`).
 *
 * They are the only rows with anything to say beyond an id, a label and a
 * glyph — Admin pins its landing section on the way in, two carry tour anchors
 * — so keeping them here leaves the composition file free to state the
 * information architecture and nothing else. The UNGATED rows stay inline
 * there: a row every deployment has is part of the IA, not a variable in it.
 */
export function gatedNavRows(args: {
  t: SidebarChromeT;
  setViewMode: (view: string) => void;
}): GatedNavRows {
  const { t, setViewMode } = args;
  return {
    assistant: {
      id: ASSISTANT_VIEW_ID,
      label: t("shell:sidebar.assistant"),
      // No tour anchor: the tour does not walk this row, exactly as it does not
      // walk About me, Admin or Skills.
      icon: <HoustonLogo />,
      onClick: () => setViewMode(ASSISTANT_VIEW_ID),
    },
    organization: {
      id: ORGANIZATION_VIEW_ID,
      label: t("settings:nav.organization"),
      icon: <Building2 className="h-4 w-4" />,
      onClick: () => {
        // The rail rule: a rail door always opens its screen's HOME, never the
        // kept-alive leftover (a team row opens its board, the footer's
        // Settings opens the index via `openSettings(null)`). Admin's home is
        // its landing section, pinned through the same one-shot store the
        // Billing deep link uses — which also backs out of a drilled section
        // like Billing when the screen is already open.
        useOrgNav.getState().requestTab(DEFAULT_ORG_TAB);
        setViewMode(ORGANIZATION_VIEW_ID);
      },
    },
    skills: {
      id: SKILLS_VIEW_ID,
      label: t("shell:sidebar.skills"),
      icon: <LibraryBig className="h-4 w-4" />,
      onClick: () => setViewMode(SKILLS_VIEW_ID),
      dataAttrs: tourAnchor("nav-skills"),
    },
    aiModels: {
      id: AI_HUB_VIEW_ID,
      label: t("shell:sidebar.aiModels"),
      icon: <Boxes className="h-4 w-4" />,
      onClick: () => setViewMode(AI_HUB_VIEW_ID),
      dataAttrs: tourAnchor("nav-ai-hub"),
    },
  };
}
