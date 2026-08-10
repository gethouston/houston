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
  /** Names the picker's trigger, e.g. "Change icon & name". */
  trigger: string;
  /** Accessible group name for the glyph grid. */
  icons: string;
  /** Accessible group name for the swatch row. */
  colors: string;
}
