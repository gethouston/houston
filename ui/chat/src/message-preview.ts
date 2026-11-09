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
import { decodeCitedMessage } from "./cited-message.ts";
import { decodeInteractionAnswersMessage } from "./interaction-answers-message.ts";
import { decodeSkillMessage } from "./skill-message.ts";

export function messagePreviewText(body: string | null | undefined): string {
  if (!body) return "";
  // File comments preview as the words around them, never the list. The
  // decoded words hold no complete envelope, so this recursion ends.
  const cited = decodeCitedMessage(body);
  if (cited)
    return (
      messagePreviewText(cited.text) || cited.skill?.description.trim() || ""
    );

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
