/**
 * The closed vocabulary of `data-tutorial-target` anchors the in-app
 * onboarding spotlights — same discipline as the guided tour's
 * `data-tour-target` set (`../shell/workspace-tour-steps.ts`), but a separate
 * attribute and union on purpose: the tour pins an invariant that EVERY tour
 * target has a tour step (`tests/workspace-tour-steps.test.ts`), and tutorial
 * anchors are not tour steps. The tutorial may also spotlight existing tour
 * anchors (e.g. the sidebar's `nav-ai-hub` row) via `tourSelector` — this set
 * holds only the anchors the tutorial ALONE needs.
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
