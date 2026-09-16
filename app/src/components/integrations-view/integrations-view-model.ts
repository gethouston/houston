/**
 * Pure, DOM-free logic for the Integrations screen's tab cluster. Extracted
 * from the view so the tab set is unit-tested in isolation (node:test), never
 * importing React.
 */

/**
 * The tabs of the Integrations screen: the apps catalog a person connects their
 * accounts through, and the shared Skills library every agent in the space
 * draws from. Both are "what my agents can reach outside themselves", which is
 * why they share one screen.
 */
export type IntegrationsTabId = "catalog" | "skills";

/**
 * The tab the screen lands on: what the header's identity lozenge stands for,
 * the same way Admin's lozenge IS Company context.
 */
export const DEFAULT_INTEGRATIONS_TAB: IntegrationsTabId = "catalog";

/**
 * The screen's tab ids in display order: the catalog (the identity lozenge and
 * landing tab), then Skills when the caller holds it. Pure so the tab set is
 * unit-tested without React; the view maps each id to its body + `t()` label.
 *
 * `showSkills` is the space-owner gate from `hooks/use-surface-gates.ts`:
 * editing a skill edits every agent in the space at once.
 */
export function integrationsTabIds(gates: {
  showSkills: boolean;
}): readonly IntegrationsTabId[] {
  return ["catalog", ...(gates.showSkills ? (["skills"] as const) : [])];
}
