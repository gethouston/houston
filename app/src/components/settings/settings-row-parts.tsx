import { Badge } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Leading({
  icon: Icon,
  leading,
  destructive,
}: {
  icon?: LucideIcon;
  leading?: ReactNode;
  destructive?: boolean;
}) {
  if (leading) return <span className="shrink-0">{leading}</span>;
  if (!Icon) return null;
  return (
    <Icon
      className={`size-[18px] shrink-0 ${
        destructive ? "text-danger" : "text-ink-muted"
      }`}
    />
  );
}

export interface RowTextProps {
  title: string;
  badge?: string;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
}

export function RowText({
  title,
  badge,
  description,
  destructive,
  disabled,
}: RowTextProps) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`truncate text-sm font-medium ${
            destructive && !disabled ? "text-danger" : "text-ink"
          }`}
        >
          {title}
        </span>
        {badge && (
          <Badge variant="secondary" className="shrink-0">
            {badge}
          </Badge>
        )}
      </span>
      {description && (
        <span className="block truncate text-xs text-ink-muted">
          {description}
        </span>
      )}
    </span>
  );
}
