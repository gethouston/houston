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
  text: string;
  citations: SentCitation[];
  attachments: AttachmentReference[];
  skill: SkillInvocation | null;
}

const ATTACHMENTS_AT = /(?:^|\n\n)(?=<!--houston:attachments \{)/g;
const ATTACHED_BLOCK = "[User attached these files.";

function sends(
  body: string,
): { words: string; files: AttachmentReference[] }[] {
  const skill = decodeSkillMessage(body);
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
