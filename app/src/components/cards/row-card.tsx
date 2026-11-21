import type { ReactNode } from "react";

interface RowCardProps {
  media: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  truncate?: boolean;
  inline?: boolean;
  size?: "sm" | "md";
  surface?: "base" | "secondary";
}

export function RowCard({
  media,
  title,
  description,
  action,
  truncate = false,
  inline = false,
  size = "sm",
  surface = "base",
}: RowCardProps) {
  const Wrapper = inline ? "span" : "div";
  const raised = surface === "secondary";
  const slabTone = raised
    ? "rounded-2xl border border-line/50 bg-input"
    : "rounded-xl bg-chip";
  const mediaTone = raised ? "bg-chip" : "bg-input";
  const rowClass = `${inline ? "inline-flex" : "flex w-full"} items-center gap-3 ${slabTone} px-3 py-2.5 min-w-0`;
  const titleSize =
    size === "md" ? "text-[15px] font-semibold" : "text-[13px] font-medium";
  const bodySize = size === "md" ? "text-[13px]" : "text-[11px]";
  const titleClass = `text-ink ${titleSize}${truncate ? " truncate" : ""}`;
  const descClass = `text-ink/70 ${bodySize}${truncate ? " truncate" : ""}`;

  const row = (
    <Wrapper className={rowClass}>
      <span
        className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ${mediaTone} text-ink`}
      >
        {media}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={titleClass}>{title}</span>
        {description != null && (
          <span className={descClass}>{description}</span>
        )}
      </span>
      {action != null && (
        <span className="flex shrink-0 items-center gap-2">{action}</span>
      )}
    </Wrapper>
  );

  if (inline) {
    return (
      <span className="not-prose my-1 inline-flex max-w-full align-middle">
        {row}
      </span>
    );
  }
  return row;
}
