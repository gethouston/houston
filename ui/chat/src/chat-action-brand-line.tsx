import { HoustonHelmet } from "@houston-ai/core";
import { useState } from "react";
import { Shimmer } from "./ai-elements/shimmer";
import type { ChatActionBrand } from "./chat-process-header";

export interface ChatActionBrandLineProps {
  /** The resolved app identity + present-tense action for the row. */
  brand: ChatActionBrand;
  /** Shimmer the text while the mission runs (matches the plain header line). */
  active?: boolean;
}

/**
 * The branded variant of the process-block header line:
 * `[logo] Gmail · Sending email`. It mirrors `ChatStatusLine`'s glyph +
 * inline-flex shell (so the prose-valid inline layout carries over), but the
 * app LOGO stands in for the Houston helmet in the icon slot and the label is
 * `{name} · {actionLabel}`.
 *
 * The logo is fixed at the text-line size and `object-contain`, so a tall or
 * wide brand image never shifts the row's height. A missing logo — or a load
 * failure (the pre-catalog favicon guess can 404) — falls back to the helmet
 * rather than showing a broken glyph. Weight stays REGULAR: the row narrates,
 * it doesn't shout.
 */
export function ChatActionBrandLine({
  brand,
  active,
}: ChatActionBrandLineProps) {
  const [failed, setFailed] = useState(false);
  const text = `${brand.name} · ${brand.actionLabel}`;
  const showLogo = brand.logoUrl && !failed;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs">
      {showLogo ? (
        <img
          alt=""
          className="size-3.5 shrink-0 rounded object-contain"
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          src={brand.logoUrl}
        />
      ) : (
        <HoustonHelmet color="currentColor" size={13} />
      )}
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
  );
}
