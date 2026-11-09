/**
 * A sent user message that carried file comments, decoded for rendering.
 *
 * The comments ride the typed words as an envelope whose format
 * `@houston/wire-types` owns. Those words can sit inside a Skill marker or an
 * attachment marker, and a queue flush joins several sends into one body, so
 * the body is cut into its sends first and each one decoded: every send's
 * words, files and comments survive, in order.
 */

import {
  decodeCitationsEnvelopes,
  type SentCitation,
} from "@houston/wire-types/citations";
import {
  type AttachmentReference,
  decodeAttachmentMessage,
} from "./attachment-message.ts";
import { decodeSkillMessage, type SkillInvocation } from "./skill-message.ts";

export interface CitedMessage {
  /** The words the person typed, without any marker or comment list. */
  text: string;
  citations: SentCitation[];
  attachments: AttachmentReference[];
  /** The Skill the message ran, when it ran one. */
  skill: SkillInvocation | null;
}

const ATTACHMENTS_AT = /(?:^|\n\n)(?=<!--houston:attachments \{)/g;
const ATTACHED_BLOCK = "[User attached these files.";

/** Each send's words and files. An attachment send's own prompt (its words
 *  again, then the list of paths) is skipped; words a later send merged in
 *  after it are kept. */
function sends(
  body: string,
): { words: string; files: AttachmentReference[] }[] {
  const skill = decodeSkillMessage(body);
  // A Skill send's prompt repeats its words: the marker holds all of them.
  if (skill) return [{ words: skill.message, files: skill.attachments }];
  const starts = [...body.matchAll(ATTACHMENTS_AT)].map((m) => m.index);
  if (starts[0] !== 0) starts.unshift(0);
  return starts.flatMap((start, i) => {
    const part = body.slice(start, starts[i + 1] ?? body.length).trim();
    const attached = decodeAttachmentMessage(part);
    if (!attached) return part ? [{ words: part, files: [] }] : [];
    const block = part.indexOf(ATTACHED_BLOCK);
    const end = block < 0 ? -1 : part.slice(block).search(/\](?:\n\n|$)/);
    const after = end < 0 ? "" : part.slice(block + end + 1).trim();
    return [
      { words: attached.message, files: attached.files },
      ...(after ? [{ words: after, files: [] }] : []),
    ];
  });
}

/** Decode a sent message's comments, or `null` when it carried none. */
export function decodeCitedMessage(body: string): CitedMessage | null {
  const decoded = sends(body);
  const texts: string[] = [];
  const citations: SentCitation[] = [];
  let found = false;
  for (const { words } of decoded) {
    const cited = decodeCitationsEnvelopes(words);
    if (cited) {
      found = true;
      citations.push(...cited.citations);
    }
    const text = (cited ? cited.text : words).trim();
    if (text) texts.push(text);
  }
  if (!found) return null;
  return {
    text: texts.join("\n\n"),
    citations,
    attachments: decoded.flatMap((d) => d.files),
    skill: decodeSkillMessage(body),
  };
}
