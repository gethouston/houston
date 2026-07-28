/**
 * The `viewMode` value for the top-level Skills page (HOU-792).
 *
 * `"skills"` itself is taken — it is a per-agent Agent Settings screen id — so
 * this mirrors the `integrations-home` precedent: a `-home` suffix keeps the
 * global view id outside `STANDARD_TAB_IDS` and the agent-admin screen space.
 */
export const SKILLS_VIEW_ID = "skills-home";
