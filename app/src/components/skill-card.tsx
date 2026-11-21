import { cn, Spinner } from "@houston-ai/core";
import type { ReactNode } from "react";
import { SkillIcon } from "./skill-icon";

interface Props {
  image?: string | null;
  title: string;
  description?: string;
  media?: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function SkillCard({
  image,
  title,
  description,
  media,
  footer,
  className,
  onClick,
  disabled,
  busy,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        "flex items-center gap-4 rounded-2xl bg-chip-solid p-4 text-left transition-colors duration-200 hover:bg-chip-solid-hover disabled:opacity-50 disabled:cursor-not-allowed w-full",
        className,
      )}
    >
      {media ?? <SkillIcon image={image} />}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {description && (
          <span className="text-xs text-ink-muted line-clamp-3 leading-relaxed">
            {description}
          </span>
        )}
        {footer && <div className="mt-0.5">{footer}</div>}
      </div>
      {busy && (
        <Spinner className="size-4 shrink-0 self-center text-ink-muted" />
      )}
    </button>
  );
}
