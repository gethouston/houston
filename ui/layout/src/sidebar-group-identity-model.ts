/**
 * The VOCABULARY of a group's look: what marks and colours a host offers, what
 * the group is wearing, and the one callback that changes it.
 *
 * Types only, in their own module so `sidebar-group-identity.tsx` stays under
 * the file-size ceiling and so a consumer that only needs the shapes (the view
 * models in `sidebar-groups.ts`) never pulls a component in to get them.
 */

/** One offerable mark. `name` indexes the glyph set; `label` names it aloud. */
export interface SidebarGroupGlyphChoice {
  name: string;
  label: string;
}

/**
 * One offerable colour. The `id` is what a group STORES and `value` is only how
 * it is painted here, so a palette can be retuned per theme without rewriting
 * anybody's stored choice.
 */
export interface SidebarGroupSwatch {
  id: string;
  value: string;
  label: string;
}

export interface SidebarGroupIdentityLabels {
  /** The menu entry that opens the picker, e.g. "Change icon & color". */
  trigger: string;
  /** Accessible group name for the glyph grid. */
  icons: string;
  /** Accessible group name for the swatch row. */
  colors: string;
  /** The reset affordance ("Default"). */
  none: string;
}

/**
 * A group's LOOK, as one object: what it is currently wearing, what it may
 * wear, and the one callback that changes it.
 *
 * One prop rather than six because a mark and a tint are a PAIR — the picker
 * previews the chosen colour on the whole glyph grid, so it cannot be handed
 * one without the other and stay honest about what a click will produce.
 */
export interface SidebarGroupIdentity {
  /** The chosen glyph NAME, absent = none chosen. */
  icon?: string;
  /** The chosen swatch id (matches `colors[].id`), absent = none chosen. */
  colorId?: string;
  glyphs: readonly SidebarGroupGlyphChoice[];
  colors: readonly SidebarGroupSwatch[];
  labels: SidebarGroupIdentityLabels;
  /** `null` on a field CLEARS it; an omitted field is left untouched. */
  onChange: (patch: { icon?: string | null; colorId?: string | null }) => void;
}
