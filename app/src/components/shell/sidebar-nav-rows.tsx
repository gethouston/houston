import type { SidebarNavItemEntry } from "@houston-ai/layout";
import { Boxes, GraduationCap, ListChecks } from "lucide-react";
import {
  ACADEMY_VIEW_ID,
  AI_HUB_VIEW_ID,
  SKILLS_VIEW_ID,
} from "../../lib/top-level-views";
import { HoustonLogo } from "../assistant/houston-logo";
import { ASSISTANT_VIEW_ID } from "../assistant/id";
import type { SidebarChromeT } from "./sidebar-chrome";
import { tourAnchor } from "./workspace-tour-steps.ts";

/** The rail's GATED rows, keyed by the gate each one rides. */
export interface GatedNavRows {
  /** `showAssistant` — the personal assistant, leading the unlabelled run. */
  assistant: SidebarNavItemEntry;
  /** `showAiModels` — the AI Models hub, in the unlabelled leading run. */
  aiModels: SidebarNavItemEntry;
  /** `showSkills` — the shared Skills library, closing the leading run. */
  skills: SidebarNavItemEntry;
}

/**
 * The rows a gate can take away, built apart from the runs that compose them
 * (`sidebar-nav-sections.tsx`).
 *
 * They are the only rows with anything to say beyond an id, a label and a
 * glyph — a test id on the Assistant, a tour anchor on AI Models, both on
 * Skills — so keeping them here leaves the composition file free to state the
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
      // No tour anchor: the tour does not walk this row. The test id is what
      // tells it apart from an agent the person happened to name "Houston", and
      // it is only present once discovery has answered, so a click waits for it.
      icon: <HoustonLogo />,
      onClick: () => setViewMode(ASSISTANT_VIEW_ID),
      dataAttrs: { "data-testid": "rail-assistant" },
    },
    aiModels: {
      id: AI_HUB_VIEW_ID,
      label: t("shell:sidebar.aiModels"),
      icon: <Boxes className="h-4 w-4" />,
      onClick: () => setViewMode(AI_HUB_VIEW_ID),
      dataAttrs: tourAnchor("nav-ai-hub"),
    },
    skills: {
      id: SKILLS_VIEW_ID,
      label: t("shell:sidebar.skills"),
      icon: <ListChecks className="h-4 w-4" />,
      onClick: () => setViewMode(SKILLS_VIEW_ID),
      dataAttrs: { ...tourAnchor("nav-skills"), "data-testid": "rail-skills" },
    },
  };
}

/**
 * The Academy row, built here because BOTH breakpoints' footer clusters draw
 * it: the rail's foot right above Settings (`sidebar-footer.tsx`) and the tail
 * of the phone's More menu (`mobile-more-menu.tsx`). One row, one label, one
 * destination, whichever cluster renders it.
 *
 * It is ungated on purpose, like Settings beside it: every deployment ships
 * the Academy, and learning to fly is nobody's admin territory. The Houston
 * tour lesson ends on it, so it carries the `nav-academy` anchor on both.
 */
export function academyNavRow(args: {
  /** `shell:sidebar.academy`, resolved by the caller: the two clusters that
   *  draw this row hold `t` over different namespace sets. */
  label: string;
  onOpen: () => void;
}): SidebarNavItemEntry {
  return {
    id: ACADEMY_VIEW_ID,
    label: args.label,
    icon: <GraduationCap className="h-4 w-4" />,
    onClick: args.onOpen,
    dataAttrs: tourAnchor("nav-academy"),
  };
}
