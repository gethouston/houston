import { HoustonHelmet } from "@houston-ai/core";
import { useState } from "react";
import { Shimmer } from "./ai-elements/shimmer";
import type { ChatActionBrand } from "./chat-process-header";

export interface ChatActionBrandLineProps {
  /** The resolved app identity + present-tense action for the row. */
  brand: ChatActionBrand;
  /** The localized "Mission in progress:" prefix, shown before the logo. */
  prefix?: string;
  /** Shimmer the text while the mission runs (matches the plain header line). */
  active?: boolean;
}

/**
 * The branded variant of the process-block header line:
 * `[helmet] Mission in progress: [logo] Gmail · Sending email`. It mirrors
 * `ChatStatusLine`'s helmet + inline-flex shell (so the mission-log identity
 * glyph and prose-valid inline layout carry over), but replaces the single
 * label string with the app logo followed by `{name} · {actionLabel}`.
 *
 * The logo is fixed at the text-line size and `object-contain`, so a tall or
 * wide brand image never shifts the row's height. A load failure drops the
 * image (the name stands alone) rather than showing a broken glyph — the pre-
 * catalog favicon guess can 404. Weight stays REGULAR: the row narrates, it
 * doesn't shout.
 */
export function ChatActionBrandLine({
  brand,
  prefix,
  active,
}: ChatActionBrandLineProps) {
  const [failed, setFailed] = useState(false);
  const text = `${brand.name} · ${brand.actionLabel}`;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs">
      <HoustonHelmet color="currentColor" size={13} />
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
        {prefix ? (
          active ? (
            <Shimmer as="span" duration={1}>
              {prefix}
            </Shimmer>
          ) : (
            <span>{prefix}</span>
          )
        ) : null}
        {brand.logoUrl && !failed ? (
          <img
            alt=""
            className="size-3.5 shrink-0 rounded object-contain"
            decoding="async"
            loading="lazy"
            onError={() => setFailed(true)}
            src={brand.logoUrl}
          />
        ) : null}
        <span className="min-w-0 truncate text-left">
          {active ? (
            <Shimmer as="span" duration={1}>
              {text}
            </Shimmer>
          ) : (
            text
          )}
        </span>
      </span>
    </span>
  );
}
