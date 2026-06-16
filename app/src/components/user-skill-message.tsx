import {
  UserAttachmentBadge,
  type UserAttachmentMessageLabels,
} from "@houston-ai/chat";
import { SkillIcon } from "./skill-icon";
import type { SkillInvocation } from "../lib/skill-message";

interface Props {
  invocation: SkillInvocation;
  attachmentLabels?: UserAttachmentMessageLabels;
}

/**
 * Read-only card rendered in place of a plain user_message body when the
 * user submitted a Skill. Mirrors the SkillCard / selected-skill visual
 * (round image bubble + title + description + integrations) and lists
 * the labelled values the user filled.
 *
 * The card sits in the right column of the conversation (where user
 * bubbles live) so the speaker attribution stays the same.
 */
export function UserSkillMessage({ invocation, attachmentLabels }: Props) {
  const {
    displayName,
    image,
    description,
    fields,
    message,
    attachments,
  } = invocation;
  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <div className="inline-block rounded-2xl bg-secondary p-4 text-left">
        <div className="flex items-start gap-3">
          <SkillIcon image={image} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              {displayName}
            </div>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        {fields.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3">
            {fields.map((f, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {f.label}
                </span>
                <span className="break-words whitespace-pre-wrap text-xs text-foreground">
                  {f.value || (
                    <span className="italic text-muted-foreground">empty</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {message.trim().length > 0 && (
        <div className="inline-block max-w-full rounded-2xl bg-secondary px-4 py-2.5 text-left text-sm leading-6 text-foreground">
          <span className="whitespace-pre-wrap break-words">{message}</span>
        </div>
      )}
      <UserAttachmentBadge files={attachments} labels={attachmentLabels} />
    </div>
  );
}
