import type { SidebarGroup, SidebarLayout } from "@houston-ai/engine-client";

/**
 * The entry an UPSERTING op appends for a group the stored layout has never
 * seen. Only a server-teams host (C13) can reach it: there the layout is an
 * ORDERING OVERLAY keyed by SERVER team id and it starts EMPTY, so the first
 * collapse or the first drop into any team names an id it does not hold yet.
 * `name` is blank at MINT because the op has none to give: on that backend the
 * name is the server's, and only `id`, `collapsed` and `agentIds` are read
 * back. It does not stay blank in the STORED layout — `normalizeTeamOverlay`
 * fills it from the live team on the same write, so a rollback to the local
 * backend never renders a nameless block. Locally every team in the rail IS a
 * stored group (`resolveTeams` reads them out of `layout.groups`), so no local
 * op can ever mint one of these.
 */
export function blankOverlayGroup(id: string): SidebarGroup {
  return { id, name: "", collapsed: false, agentIds: [] };
}

/** Append a new, empty, expanded group with a caller-minted id. */
export function createGroupOp(
  layout: SidebarLayout,
  id: string,
  name: string,
): SidebarLayout {
  return {
    ...layout,
    groups: [...layout.groups, { id, name, collapsed: false, agentIds: [] }],
  };
}

/** Rename a group (no-op if the id is unknown). */
export function renameGroupOp(
  layout: SidebarLayout,
  id: string,
  name: string,
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === id ? { ...g, name } : g)),
  };
}

/** Set a group's shared context, injected into every member agent's prompt. */
export function setGroupContextOp(
  layout: SidebarLayout,
  id: string,
  context: string,
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === id ? { ...g, context } : g)),
  };
}

/** One group's visual identity after a patch. The two keys are REMOVED rather
 *  than set to `undefined`, so an unset field reads absent exactly the way a
 *  layout written before identity existed does. Rest-destructuring instead of
 *  `delete` keeps every OTHER field of the group carried through untouched. */
function withIdentity(
  group: SidebarGroup,
  patch: { icon?: string | null; color?: string | null },
): SidebarGroup {
  const { icon: _icon, color: _color, ...base } = group;
  const icon =
    patch.icon === undefined ? group.icon : (patch.icon ?? undefined);
  const color =
    patch.color === undefined ? group.color : (patch.color ?? undefined);
  return {
    ...base,
    ...(icon !== undefined ? { icon } : {}),
    ...(color !== undefined ? { color } : {}),
  };
}

/**
 * Set a group's glyph + color (no-op if the id is unknown, like
 * {@link renameGroupOp}).
 *
 * `null` CLEARS a field, a string sets it, an omitted field is untouched —
 * the same three-state spelling the C13 wire uses (`""` there, `null` here,
 * because a stored layout has no wire to serialise an empty string onto).
 */
export function setGroupIdentityOp(
  layout: SidebarLayout,
  groupId: string,
  patch: { icon?: string | null; color?: string | null },
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) =>
      g.id === groupId ? withIdentity(g, patch) : g,
    ),
  };
}

/** Delete a group and append its members to the default section. */
export function deleteGroupOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  const target = layout.groups.find((g) => g.id === id);
  if (!target) return layout;
  const freed = target.agentIds.filter(
    (agentId) => !layout.ungroupedOrder.includes(agentId),
  );
  return {
    ...layout,
    groups: layout.groups.filter((g) => g.id !== id),
    ungroupedOrder: [...layout.ungroupedOrder, ...freed],
  };
}

/**
 * Toggle a group's collapsed flag, UPSERTING by id: an id the layout does not
 * hold gets a {@link blankOverlayGroup} appended first, then toggled like any
 * other. Matching only would make collapsing a server team a silent no-op,
 * because on that backend the overlay holds nothing until the user first acts
 * on a team. Locally the id always matches, so the append can never fire and
 * the map below is the op exactly as it shipped.
 */
export function toggleGroupCollapsedOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  const groups = layout.groups.some((g) => g.id === id)
    ? layout.groups
    : [...layout.groups, blankOverlayGroup(id)];
  return {
    ...layout,
    groups: groups.map((g) =>
      g.id === id ? { ...g, collapsed: !g.collapsed } : g,
    ),
  };
}
