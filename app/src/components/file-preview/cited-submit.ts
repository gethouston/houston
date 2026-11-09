import type { ComposerSubmitOutcome } from "@houston-ai/board";

/** The composer text with the draft's file comments folded in, and how to
 *  give them back when that text never leaves. */
export interface CitedText {
  text: string;
  onUnsent: () => void;
}

/**
 * The composer's submit with file comments: fold them into the text first,
 * so a Skill's own send carries them as much as the board's routed send does.
 * A send that throws gives them back. One that went out keeps them out: the
 * engine's verdict on it decides whether they come back.
 */
export async function submitWithCitations<Ctx extends { text: string }>(
  ctx: Ctx,
  prepare: (text: string) => Promise<CitedText | null>,
  submit: (ctx: Ctx) => ComposerSubmitOutcome | Promise<ComposerSubmitOutcome>,
): Promise<ComposerSubmitOutcome> {
  const cited = await prepare(ctx.text);
  if (!cited) return submit(ctx);
  let outcome: ComposerSubmitOutcome;
  try {
    outcome = await submit({ ...ctx, text: cited.text });
  } catch (error) {
    cited.onUnsent();
    throw error;
  }
  return outcome === false ? cited : outcome;
}
