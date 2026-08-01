import type {
  MessageMention,
  SessionStartRequest,
} from "../../../../ui/engine-client/src/types";

/**
 * How N held sends become ONE (see send-queue.ts): the per-field merge rules for
 * a flush. Every field of the combined request comes from the LAST entry (the
 * most recent picker state) EXCEPT the ones derived here, which must reflect ALL
 * the merged entries — the combined send says everything the user typed, so it
 * must also carry everything that text implied.
 */

/** The fields a flush derives from the whole queue rather than its last entry. */
export type MergedSendFields = Pick<
  SessionStartRequest,
  "prompt" | "displayText" | "mentions"
>;

/** Trim, drop the empties, and join blank-line-separated — the shape the old
 *  app-side queue produced. */
const joinLines = (parts: readonly string[]): string =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");

/**
 * The @mention sidecars of every merged entry, deduped by `userId` and in
 * first-seen order (HOU-944). The combined prompt contains every entry's text,
 * so it must carry every entry's mentions: taking only the last entry's (the
 * rule for the picker overrides) would silently drop a teammate the user named
 * in an earlier queued line — the one thing a merge must never lose.
 * `undefined` when no entry mentioned anyone, so an unmentioning flush stays
 * byte-identical to what it sent before mentions existed.
 */
function unionMentions(
  reqs: readonly SessionStartRequest[],
): MessageMention[] | undefined {
  const seen = new Map<string, MessageMention>();
  for (const r of reqs)
    for (const m of r.mentions ?? [])
      if (!seen.has(m.userId)) seen.set(m.userId, m);
  return seen.size > 0 ? [...seen.values()] : undefined;
}

/**
 * Combine the held requests' prompt, bubble text and @mentions.
 *
 * The BUBBLE is reconstructed exactly like the prompt so a history reload
 * matches what the send showed: each entry contributes what its own bubble
 * showed (`displayText ?? prompt`). It is only carried when at least one entry
 * hid its prompt behind a `displayText`; otherwise the bubble equals the prompt
 * and the field stays absent.
 */
export function mergeSendFields(
  reqs: readonly SessionStartRequest[],
): MergedSendFields {
  return {
    prompt: joinLines(reqs.map((r) => r.prompt)),
    displayText: reqs.some((r) => r.displayText !== undefined)
      ? joinLines(reqs.map((r) => r.displayText ?? r.prompt))
      : undefined,
    mentions: unionMentions(reqs),
  };
}
