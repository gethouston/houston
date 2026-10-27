import { type Activity, isMissionStarter } from "@houston/protocol";
import { sanitizeContributors } from "./contributors";
import { sanitizeMentions } from "./mentions";

/**
 * Drop malformed server-stamped fields from one activity read off disk. Only
 * the host writes these, but agents edit activity.json with file tools, so a
 * hand-typed value must never reach a reader as if the host had stamped it.
 * `activity` is the entry's own copy and is edited in place.
 */
export function sanitizeActivityStamps(
  activity: Activity,
  entry: Record<string, unknown>,
): void {
  if (typeof entry.last_message_at !== "string")
    delete activity.last_message_at;
  if (typeof entry.created_by !== "string") delete activity.created_by;
  if (entry.contributors !== undefined) {
    if (Array.isArray(entry.contributors)) {
      activity.contributors = sanitizeContributors(entry.contributors);
    } else {
      delete activity.contributors;
    }
  }
  if (entry.mentioned !== undefined) {
    const mentioned = sanitizeMentions(entry.mentioned);
    if (mentioned) activity.mentioned = mentioned;
    else delete activity.mentioned;
  }
  if (!isMissionStarter(entry.started_by)) delete activity.started_by;
}
