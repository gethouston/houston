/**
 * The closed vocabulary of `data-tutorial-target` anchors the tutorial
 * spotlights point at — same discipline as the shell's `data-tour-target` set
 * (`../shell/workspace-tour-steps.ts`), but a separate attribute and union
 * on purpose: those name the shell's own durable landmarks (rail rows, the
 * main region, New task), while these are anchors that exist ONLY so a
 * tutorial step has something to point at. A step may spotlight either — the
 * shell's via `tourSelector`, these via `tutorialSelector`.
 */
export const TUTORIAL_TARGETS = [
  // The AI hub's catalog plane (`ai-hub-view.tsx`) — the connect step
  // spotlights it so the user connects on the REAL surface.
  "aiHubProviders",
  // The Integrations view's catalog plane (`integrations-view.tsx`) — the
  // connect-integration step spotlights it the same way.
  "integrationsCatalog",
  // Inside the create-agent dialog (`agent-picker-step.tsx` /
  // `naming-step.tsx`) — the tutorial coaches through the REAL dialog.
  "createAgentBlankTile",
  "createAgentNaming",
] as const;

export type TutorialTarget = (typeof TUTORIAL_TARGETS)[number];

/** The selector `TutorialSpotlight` queries to open its hole. */
export function tutorialSelector(target: TutorialTarget): string {
  return `[data-tutorial-target='${target}']`;
}

/**
 * The DOM attributes that make an element a tutorial anchor. Producers spread
 * this so the anchor and the step that spotlights it are checked against the
 * SAME union — a rename on one side is a compile error, not a spotlight that
 * silently finds nothing.
 */
export function tutorialAnchor(target: TutorialTarget): {
  "data-tutorial-target": TutorialTarget;
} {
  return { "data-tutorial-target": target };
}
