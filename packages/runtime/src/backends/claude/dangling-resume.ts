/**
 * The SDK's rejection of a `resume` id it cannot find. `resolveResume` already
 * drops mappings whose transcript file is gone, but the SDK scopes its lookup
 * to the CURRENT cwd's project slug — after an agent rename moves the
 * workspace directory, the transcript still exists (old slug) yet every resume
 * fails with this error, permanently wedging the conversation (HOU-892 side
 * finding: a weekly routine erroring on every fire after its agent was
 * renamed). Matched on the message because the SDK surfaces it both as a
 * thrown error and as an error result.
 */
const DANGLING_RESUME_RE = /No conversation found with session ID/i;

/** Whether `message` is the SDK refusing the `resume` id this attempt tried. */
export function rejectedResume(
  resume: string | undefined,
  message: string,
): boolean {
  return resume !== undefined && DANGLING_RESUME_RE.test(message);
}
