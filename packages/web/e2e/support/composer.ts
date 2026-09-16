/**
 * The chat composer's placeholders — the app's `board:composer.*` copy, which
 * the specs locate the composer by. Kept in one place so a copy change is one
 * edit here rather than a sweep over every spec that types into a chat.
 */
export const NEW_TASK_PLACEHOLDER = "What should the AI Employee work on?";
export const FOLLOW_UP_PLACEHOLDER = "Send a follow-up...";
/** The 1-on-1 Houston chat's own opening question. The follow-up wording only
 *  arrives once that conversation has had a turn, so an empty assistant chat
 *  is located by this rather than by {@link FOLLOW_UP_PLACEHOLDER}. */
export const ASSISTANT_PLACEHOLDER = "What should Houston work on?";

/**
 * The assistant's composer whichever question it is asking — for the steps that
 * only need the place the user types, not the wording. A thread's emptiness is
 * not a spec's to assume: it depends on what ran before it in the same host.
 */
export const ASSISTANT_COMPOSER = new RegExp(
  `^(?:${[ASSISTANT_PLACEHOLDER, FOLLOW_UP_PLACEHOLDER]
    .map((copy) => copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})$`,
);
