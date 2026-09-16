/**
 * Which face Settings > Workspace management wears, and what that costs a
 * pinned Admin section. Pure and DOM-free so both decisions are node-testable
 * without a React tree.
 */

/** The faces the section can wear, including the one that has not resolved. */
export type WorkspaceManagementFace = "organization" | "workspace" | "pending";

/** A face the surface gates have actually answered for. */
export type SettledWorkspaceManagementFace = Exclude<
  WorkspaceManagementFace,
  "pending"
>;

/**
 * The face to render. `showOrganization` is computed from capabilities, which
 * are null while they load, so an unresolved gate is indistinguishable from a
 * denied one: a space switch drops the capabilities query
 * (`resetCacheForSpaceChange`) and the gate reads false for a beat. Falling to
 * the workspace-name card there would evict an owner from the dashboard they
 * are standing in, so an unresolved gate holds the face last settled on, and
 * the very first load waits on a skeleton rather than guessing.
 */
export function workspaceManagementFace(input: {
  ready: boolean;
  showOrganization: boolean;
  last: SettledWorkspaceManagementFace | null;
}): WorkspaceManagementFace {
  if (input.ready) return input.showOrganization ? "organization" : "workspace";
  return input.last ?? "pending";
}

/**
 * Whether a pinned Admin section (the C8 team-status banner's Billing deep
 * link) has to be dropped. Only the dashboard consumes a pin, so a space whose
 * Workspace management IS the plain card would otherwise keep it for the rest
 * of the session and spend it on the next dashboard the user opens. An
 * unresolved face keeps it: the banner pins and navigates in the same breath,
 * and clearing during that window would lose the link the dashboard is about
 * to honor.
 */
export function workspaceManagementDropsOrgPin(
  face: WorkspaceManagementFace,
): boolean {
  return face === "workspace";
}
