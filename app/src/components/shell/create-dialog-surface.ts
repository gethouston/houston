/** 1 = the chooser, 2 = name a blank agent, "copy" = model it on an existing one. */
export type CreateAgentStep = 1 | 2 | "copy";

/**
 * The dialog's surface per step. Step 1 is a row of square choice tiles at the
 * same tile geometry as the sidebar's create chooser (a third tile widens the
 * surface by one tile), so the two screens read as one flow; the wizards take
 * a tall, fixed-height sheet whose body scrolls.
 */
export function createDialogSurface(
  step: CreateAgentStep,
  canCopy: boolean,
): string {
  if (step === 1) {
    return canCopy
      ? "sm:max-w-lg p-0 gap-0 overflow-hidden"
      : "sm:max-w-sm p-0 gap-0 overflow-hidden";
  }
  const width = step === "copy" ? "sm:max-w-[680px]" : "sm:max-w-[900px]";
  return `${width} h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden`;
}
