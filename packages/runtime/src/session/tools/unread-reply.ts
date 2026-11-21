const QUOTE_LIMIT = 6000;

const SCREEN =
  "The user never sees your reasoning or tool results, from this turn or earlier ones. Your visible messages from earlier turns are still on their screen.";

const WRITE_IT_OUT =
  "Anything you found or prepared for them that exists only in your reasoning or tool results (an answer, a link, a draft, findings) is not 'above' or 'earlier': write it out in full in your closing message.";

export function unreadReplyInstruction(visibleText: string): string {
  const seen = visibleText.trim();
  if (!seen)
    return `${SCREEN} So far this turn they have read nothing from you. ${WRITE_IT_OUT}`;
  const chars = Array.from(seen);
  if (chars.length <= QUOTE_LIMIT)
    return `${SCREEN} What they have read from you this turn is quoted here, verbatim:\n<read_by_user>\n${seen}\n</read_by_user>\nDo not repeat it. ${WRITE_IT_OUT}`;
  const tail = chars.slice(-QUOTE_LIMIT).join("");
  return `${SCREEN} This turn they have read a long reply from you; its end is quoted here, verbatim:\n<read_by_user>\n[...] ${tail}\n</read_by_user>\nDo not repeat any of it, including the earlier part cut at [...]. ${WRITE_IT_OUT}`;
}
