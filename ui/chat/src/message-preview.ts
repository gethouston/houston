import { decodeAttachmentMessage } from "./attachment-message.ts";
import { decodeCitedMessage } from "./cited-message.ts";
import { decodeInteractionAnswersMessage } from "./interaction-answers-message.ts";
import { decodeSkillMessage } from "./skill-message.ts";

export function messagePreviewText(body: string | null | undefined): string {
  if (!body) return "";
  const cited = decodeCitedMessage(body);
  if (cited)
    return (
      messagePreviewText(cited.text) || cited.skill?.description.trim() || ""
    );

  const skill = decodeSkillMessage(body);
  if (skill) {
    const message = skill.message.trim();
    if (message) return message;
    return skill.description.trim();
  }

  const attachment = decodeAttachmentMessage(body);
  if (attachment) return messagePreviewText(attachment.message.trim());

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
