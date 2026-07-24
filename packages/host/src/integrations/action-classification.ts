/**
 * Read/write classification for integration action slugs. Composio (and our
 * custom executor actions) ship NO read/write metadata, so we classify by the
 * slug's verb segments: `GMAIL_FETCH_EMAILS` reads, `GMAIL_SEND_EMAIL` writes.
 * Used by the execute-time approval gate to run read-only actions ungated (a
 * READ never needs supervision), while every mutating action keeps its card.
 *
 * The contract is deliberately CONSERVATIVE: a miss is safe. An unclassified
 * slug (unknown verb, or a read verb mixed with a write verb) is treated as
 * NOT read-only, so it just shows the approval card exactly as today. The only
 * thing that must never happen is a mutating action slipping through as
 * read-only — hence "read verb present AND no write verb present" (below),
 * never "read verb present".
 */

/** Verbs that only observe — segments that mark a slug as a candidate read. */
const READ_VERBS: ReadonlySet<string> = new Set([
  "GET",
  "LIST",
  "FETCH",
  "SEARCH",
  "FIND",
  "READ",
  "RETRIEVE",
  "LOOKUP",
  "QUERY",
  "CHECK",
  "COUNT",
  "VIEW",
  "DESCRIBE",
]);

/** Verbs that mutate, send, or otherwise carry side effects — any one of these
 *  in a slug disqualifies it from read-only, even alongside a read verb. */
const WRITE_VERBS: ReadonlySet<string> = new Set([
  "SEND",
  "CREATE",
  "DELETE",
  "UPDATE",
  "ADD",
  "REMOVE",
  "POST",
  "SET",
  "MOVE",
  "ARCHIVE",
  "EDIT",
  "WRITE",
  "UPLOAD",
  "INSERT",
  "PATCH",
  "PUT",
  "REPLY",
  "FORWARD",
  "SUBMIT",
  "EXECUTE",
  "RUN",
  "TRASH",
  "CANCEL",
  "PUBLISH",
  "SHARE",
  "INVITE",
  "MERGE",
  "CLOSE",
  "ACCEPT",
  "REJECT",
  "APPROVE",
  "ASSIGN",
  "COMPLETE",
  "MARK",
  "STAR",
  "MUTE",
  "PIN",
  "CLONE",
  "COPY",
  "IMPORT",
  "SYNC",
  "TRIGGER",
  "START",
  "STOP",
  "PAUSE",
  "RESUME",
  "RESTART",
  "GRANT",
  "REVOKE",
  "BAN",
  "KICK",
  "PURGE",
  "CLEAR",
  "RESET",
  "DESTROY",
  "DEACTIVATE",
  "ACTIVATE",
  "ENABLE",
  "DISABLE",
  "RENAME",
  "TRANSFER",
  "WITHDRAW",
  "PAY",
  "REFUND",
  "ORDER",
  "BUY",
  "SELL",
  "BOOK",
  "SCHEDULE",
  "SIGN",
  // Mutating verbs that often ride beside a noun colliding with a read verb
  // ("SUBSCRIBE_TO_LIST", "FOLLOW_..."): without these, the noun LIST/CHECK/
  // VIEW would mark the slug a read and let the mutation run ungated.
  "SUBSCRIBE",
  "UNSUBSCRIBE",
  "FOLLOW",
  "UNFOLLOW",
  "LIKE",
  "UNLIKE",
  "REACT",
  "COMMENT",
  "JOIN",
  "LEAVE",
  "LOCK",
  "UNLOCK",
  "RESTORE",
  "DUPLICATE",
  "SAVE",
  "APPEND",
  "PUSH",
  "NOTIFY",
  "DISPATCH",
  "MODIFY",
  "CHANGE",
  "TOGGLE",
  "APPLY",
  "ATTACH",
  "DETACH",
  "REGISTER",
  "UNREGISTER",
  "LINK",
  "UNLINK",
  "TAG",
  "UNTAG",
  "LABEL",
  "REPOST",
  "RETWEET",
  "VOTE",
  "UPVOTE",
  "DOWNVOTE",
  "FLAG",
  "BLOCK",
  "UNBLOCK",
  "UNARCHIVE",
  "UNSTAR",
  "UNPIN",
  "UNMUTE",
  "SNOOZE",
]);

/**
 * True IFF `action` is safe to run WITHOUT an approval card: at least one
 * segment is a read verb AND no segment is a write verb. Case-insensitive;
 * everything ambiguous (no read verb, or read mixed with write) is false.
 */
export function isReadOnlyAction(action: string): boolean {
  const segments = action.toUpperCase().split("_");
  let sawRead = false;
  for (const segment of segments) {
    if (WRITE_VERBS.has(segment)) return false;
    if (READ_VERBS.has(segment)) sawRead = true;
  }
  return sawRead;
}
