/**
 * The `viewMode` value for the top-level Skills page — the shared library every
 * agent in the space draws from, reached from its own row in the rail.
 *
 * Deliberately NOT `"skills"`, for the same reason `INTEGRATIONS_VIEW_ID` is
 * not `"integrations"`: that slug is the per-agent settings page's Skills
 * SECTION, and one string meaning two surfaces is how a stale value lands
 * somewhere nobody asked for. `"skills-home"` says what it is next to
 * `"integrations-home"` and `"settings"`.
 */
export const SKILLS_VIEW_ID = "skills-home";
