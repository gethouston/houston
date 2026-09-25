/**
 * The prompt a mission's first turn actually carries, when it is not the text
 * the user typed.
 *
 * Two shapes, and what separates them is WHEN each may run — the warming queue
 * is the caller that cares (`lib/warming-send-prompt.ts` has the full rule):
 *
 *  - `kickoffPrompt` is pure and synchronous: a setup chat's hidden kickoff,
 *    composed from the activity id and what the app already knows. Nothing has
 *    to reach the engine for it, so the warming path resolves it the moment
 *    the id exists and PERSISTS it with the queued send — which is the only
 *    reason a relaunch mid-warm-up still delivers the mission. A setup chat
 *    has no user text at all, so a lost kickoff leaves nothing to send.
 *  - `buildPrompt` writes through the engine first (it saves the composer's
 *    attachments and appends their refs). It must not run against a pod that
 *    is still coming up, so the warming path keeps it as a closure and runs it
 *    at flush; after a relaunch the send falls back to the user's own words.
 */

export interface MissionPromptOptions {
  /**
   * Hidden kickoff for a mission: pure, synchronous, persistable.
   *
   * Two ways keep it out of the transcript, and which one applies depends on
   * `text`. With user text (the email lesson's own line), the display-text path
   * (`lib/hidden-prompt-display-text.ts`) shows the user's words and masks the
   * kickoff. With NO user text (a setup chat), that path resolves to nothing,
   * so the kickoff MUST be wrapped in the auto-continue marker
   * (`lib/auto-continue-message.ts` `encodeAutoContinueMessage`); unwrapped,
   * the user reads Houston's instructions to the agent as a bubble they
   * supposedly typed.
   */
  kickoffPrompt?: (activityId: string) => string;
  /**
   * Builds the prompt actually sent to Claude, given the freshly-created
   * activity id. The board-tab uses this to save attachments under
   * `activity-{id}` and then append their absolute paths to the prompt — all
   * without changing the user-visible description stored on the activity row.
   */
  buildPrompt?: (activityId: string) => Promise<string> | string;
}

/** True when the wire prompt is not what the user typed, so their bubble has
 *  to be told what to render. */
export function hasHiddenPrompt(opts: MissionPromptOptions): boolean {
  return Boolean(opts.kickoffPrompt ?? opts.buildPrompt);
}

/** The prompt for an activity that now has an id; `text` when neither builder
 *  is set. */
export async function missionPrompt(
  opts: MissionPromptOptions,
  activityId: string,
  text: string,
): Promise<string> {
  if (opts.kickoffPrompt) return opts.kickoffPrompt(activityId);
  if (opts.buildPrompt) return opts.buildPrompt(activityId);
  return text;
}

/** What each of the two shapes contributes to a QUEUED send, once the mission
 *  has its client-generated id: the kickoff resolved (and so persistable),
 *  the attachment builder still a closure bound to that id. */
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
