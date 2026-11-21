import type { ComposerSubmitOutcome } from "@houston-ai/board";

export interface CitedText {
  text: string;
  onUnsent: () => void;
}

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
