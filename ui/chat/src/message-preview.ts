/**
 * Short, human-readable preview of a persisted user-message body.
 *
 * Skill and attachment invocations persist a leading HTML-comment marker
 * (`<!--houston:skill ...-->` / `<!--houston:attachments ...-->`) followed by
 * the model-facing prompt. Rendering that body verbatim on a card or list
 * leaks the raw marker JSON to the user — e.g. a mission card whose first
 * message ran a Skill showed `<!--houston:skill {"skill":"set-up-my-...`
 * instead of what the user actually asked for (HOU-425).
 *
 * This decodes the body the same way the chat does and returns clean text:
 *  - Skill: the text the user typed; when they sent the Skill on its own,
 *    the Skill's one-line description (never the slug/marker). Falls through
 *    to "" so the surface can hide an empty subtitle rather than echo the
 *    card title.
 *  - Attachment: the text the user typed (absolute paths stay hidden),
 *    itself decoded when it carries an interaction-answers marker.
 *  - Plain text: returned unchanged.
 *
 * Lives next to the marker decoders so every consumer (mission cards,
 * archived lists, future embedded chats) derives the same preview.
 */

import { decodeAttachmentMessage } from "./attachment-message.ts";
import { decodeInteractionAnswersMessage } from "./interaction-answers-message.ts";
import { decodeSkillMessage } from "./skill-message.ts";

/** A sent message's file-comments envelope, whose format `@houston/wire-types`
 *  owns (citations): a preview shows the words around it, never the list. */
const CITATIONS_ENVELOPE_RE =
  /\n*<!--houston:citations \[[\s\S]*?\]-->[\s\S]*?<!--\/houston:citations-->/g;

export function messagePreviewText(body: string | null | undefined): string {
  if (!body) return "";
  if (body.includes("<!--houston:citations "))
    return messagePreviewText(body.replace(CITATIONS_ENVELOPE_RE, "").trim());

  const skill = decodeSkillMessage(body);
  if (skill) {
    const message = skill.message.trim();
    if (message) return message;
    // Skill sent with no composer text: the one-line description reads as a
    // human subtitle. "" when absent → the card simply hides the line.
    return skill.description.trim();
  }

  const attachment = decodeAttachmentMessage(body);
  // The typed text may itself be marked (an interaction card's answers sent
  // with files), so it previews through the same decoders.
  if (attachment) return messagePreviewText(attachment.message.trim());

  // Interaction-answers ride behind an HTML-comment marker followed by the flat
  // "<question>: <answer>" text the model reads. Decode to a clean one-line
  // join of the answers so previews never leak the raw marker JSON.
  const interaction = decodeInteractionAnswersMessage(body);
  if (interaction) {
    return interaction.lines
      .map((line) =>
        line.question ? `${line.question}: ${line.answer}` : line.answer,
      )
      .join("; ")
      .trim();
  }

  return body;
}
