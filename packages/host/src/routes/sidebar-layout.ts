import type { SidebarGroup, SidebarLayout } from "@houston/protocol";

/** The empty layout returned when none is stored (or the stored one is corrupt). */
export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  groups: [],
  ungroupedOrder: [],
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Strict guard for a client-supplied sidebar layout: rejects anything that is
 * not the exact shape (non-object, malformed group, or a non-string-array
 * order) so hostile/corrupt input can never persist. Doubles as the read-path
 * validator, so a hand-edited pref falls back to the default.
 */
export function parseSidebarLayout(body: unknown): SidebarLayout | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.groups)) return null;
  const groups: SidebarGroup[] = [];
  for (const g of b.groups) {
    if (!g || typeof g !== "object" || Array.isArray(g)) return null;
    const gr = g as Record<string, unknown>;
    if (
      typeof gr.id !== "string" ||
      typeof gr.name !== "string" ||
      typeof gr.collapsed !== "boolean" ||
      !isStringArray(gr.agentIds)
    )
      return null;
    groups.push({
      id: gr.id,
      name: gr.name,
      collapsed: gr.collapsed,
      agentIds: gr.agentIds,
    });
  }
  if (!isStringArray(b.ungroupedOrder)) return null;
  return { groups, ungroupedOrder: b.ungroupedOrder };
}

/** Parse the stored `sidebar_layout` pref, falling back to the default. */
export function readSidebarLayout(raw: string | null): SidebarLayout {
  if (!raw) return DEFAULT_SIDEBAR_LAYOUT;
  // A corrupt/hand-edited doc reads as the default rather than 500ing the
  // sidebar (mirrors loadPreferences treating a non-object doc as empty).
  try {
    return parseSidebarLayout(JSON.parse(raw)) ?? DEFAULT_SIDEBAR_LAYOUT;
  } catch {
    return DEFAULT_SIDEBAR_LAYOUT;
  }
}
