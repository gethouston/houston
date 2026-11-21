import { HoustonHelmet } from "@houston-ai/core";
import { Wrench } from "lucide-react";
import { useState } from "react";
import { Shimmer } from "./ai-elements/shimmer";
import type { ChatActionBrand } from "./chat-process-header";

export interface ChatActionBrandLineProps {
  brand: ChatActionBrand;
  active?: boolean;
  count?: number;
}

export function ChatActionBrandLine({
  brand,
  active,
  count,
}: ChatActionBrandLineProps) {
  const [failed, setFailed] = useState(false);
  const repeat = count && count > 1 ? ` x${count}` : "";
  const text = `${brand.name} · ${brand.actionLabel}${repeat}`;
  const showLogo = brand.logoUrl && !failed;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs">
      {brand.icon === "tool" ? (
        <Wrench aria-hidden className="size-3.5 shrink-0" />
      ) : showLogo ? (
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
