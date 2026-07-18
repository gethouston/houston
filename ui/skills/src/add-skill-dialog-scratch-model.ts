/**
 * Pure form logic for ScratchView (AddSkillDialog's "From scratch" tab),
 * extracted so validation is unit-testable without rendering.
 */

export interface ScratchFormInput {
  title: string;
  description: string;
  body: string;
}

/**
 * Convert a free-form title ("Draft a contract") into a kebab-case slug
 * Houston stores on disk ("draft-a-contract"). Strips non-ASCII, collapses
 * runs of separators, trims leading/trailing dashes.
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * The engine rejects a skill without a description (400), so the form must
 * require it client-side. The nudge shows before a save attempt: once the
 * user has visited the field and left it empty, or skipped past it entirely
 * (title and body filled while the description is still blank).
 */
export function needsDescriptionNudge(
  form: ScratchFormInput,
  descriptionTouched: boolean,
): boolean {
  if (form.description.trim().length > 0) return false;
  if (descriptionTouched) return true;
  return form.title.trim().length > 0 && form.body.trim().length > 0;
}

export function canSubmitScratchForm(
  form: ScratchFormInput,
  slugTaken: boolean,
): boolean {
  return (
    form.title.trim().length > 0 &&
    form.description.trim().length > 0 &&
    form.body.trim().length > 0 &&
    !slugTaken
  );
}
