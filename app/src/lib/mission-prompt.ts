export interface MissionPromptOptions {
  kickoffPrompt?: (activityId: string) => string;
  buildPrompt?: (activityId: string) => Promise<string> | string;
}

export function hasHiddenPrompt(opts: MissionPromptOptions): boolean {
  return Boolean(opts.kickoffPrompt ?? opts.buildPrompt);
}

export async function missionPrompt(
  opts: MissionPromptOptions,
  activityId: string,
  text: string,
): Promise<string> {
  if (opts.kickoffPrompt) return opts.kickoffPrompt(activityId);
  if (opts.buildPrompt) return opts.buildPrompt(activityId);
  return text;
}

export function warmingPromptInputs(
  opts: MissionPromptOptions,
  activityId: string,
): { prompt?: string; buildPrompt?: () => Promise<string> | string } {
  const build = opts.buildPrompt;
  return {
    prompt: opts.kickoffPrompt?.(activityId),
    buildPrompt: build ? () => build(activityId) : undefined,
  };
}
