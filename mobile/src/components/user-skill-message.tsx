/**
 * Mobile-friendly read-only card for a skill-invocation user message.
 *
 * Mirrors the desktop's UserSkillMessage layout (icon + name +
 * description + integration logos + labelled values) but stays minimal:
 * no Composio catalog lookup (we fall back to favicons), no React
 * Query, just the decoded payload + plain `<img>` tags.
 */

import { useState } from "react";
import {
  UserAttachmentBadge,
  type SkillInvocation,
  resolveSkillImage,
} from "@houston-ai/chat";

interface Props {
  invocation: SkillInvocation;
}

export function UserSkillMessage({ invocation }: Props) {
  const {
    displayName,
    image,
    description,
    integrations,
    fields,
    message,
    attachments,
  } = invocation;
  return (
    <div className="flex max-w-sm flex-col items-end gap-2">
      <div className="inline-block rounded-2xl bg-secondary p-4 text-left">
        <div className="flex items-start gap-3">
          <ImageBubble src={resolveSkillImage(image)} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              {displayName}
            </div>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {integrations.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                {integrations.map((slug) => (
                  <IntegrationLogo key={slug} slug={slug} />
                ))}
              </div>
            )}
          </div>
        </div>

        {fields.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3">
            {fields.map((f) => (
              <div key={f.label} className="flex flex-col gap-0.5">
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
      <UserAttachmentBadge files={attachments} />
    </div>
  );
}

function ImageBubble({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="size-12 rounded-full bg-input flex items-center justify-center shrink-0" />
    );
  }
  return (
    <span className="size-12 rounded-full bg-input flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="w-full h-full object-contain p-2 grayscale"
      />
    </span>
  );
}

function IntegrationLogo({ slug }: { slug: string }) {
  const [broken, setBroken] = useState(false);
  const url = `https://www.google.com/s2/favicons?domain=${slug}.com&sz=128`;
  if (broken) {
    return (
      <span
        title={slug}
        className="size-4 rounded-[4px] bg-accent flex items-center justify-center text-[9px] font-semibold text-muted-foreground"
      >
        {slug.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={slug}
      title={slug}
      onError={() => setBroken(true)}
      className="size-4 rounded-[4px] object-contain"
    />
  );
}
