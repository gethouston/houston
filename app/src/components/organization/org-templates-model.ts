/**
 * Pure, DOM-free logic for the Organization > Templates tab (Teams v2). Kept out
 * of the view so the delete gate is unit-tested in isolation (node:test), never
 * importing React. Model-brand labelling lives in `lib/template-summary`
 * (`modelBrand`) so this tab and the create-from-template picker stay in sync.
 */

/** Inputs to the who-can-delete decision for one template. */
export interface TemplateDeleteGate {
  /** Is the caller the org owner? */
  isOwner: boolean;
  /** The template's creator user id. */
  createdBy: string;
  /** The caller's own user id, or null when the session isn't loaded. */
  currentUserId: string | null;
}

/**
 * Whether the caller may delete a template. Owners may delete any template; an
 * admin may delete only the templates they created. Mirrors the gateway wire
 * gate (`deleteOrgTemplate` 403s otherwise) — this only decides whether to show
 * the affordance; the gateway stays the enforcer. Pure so it's unit-tested
 * without React.
 */
export function canDeleteTemplate({
  isOwner,
  createdBy,
  currentUserId,
}: TemplateDeleteGate): boolean {
  if (isOwner) return true;
  return currentUserId !== null && createdBy === currentUserId;
}
