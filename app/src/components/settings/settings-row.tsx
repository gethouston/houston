import { cn } from "@houston-ai/core";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Leading, RowText } from "./settings-row-parts";

interface SettingsCardProps {
  title?: string;
  children: ReactNode;
}

interface SettingsGroupTitleProps {
  children: ReactNode;
  className?: string;
}

export function SettingsGroupTitle({
  children,
  className = "",
}: SettingsGroupTitleProps) {
  return (
    <h2 className={`mb-3 px-1 text-base font-semibold text-ink ${className}`}>
      {children}
    </h2>
  );
}

export function SettingsCard({ title, children }: SettingsCardProps) {
  return (
    <section>
      {title && <SettingsGroupTitle>{title}</SettingsGroupTitle>}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {children}
      </div>
    </section>
  );
}

interface SettingsRowProps {
  icon: LucideIcon;
  title: string;
  badge?: string;
  description?: string;
  ariaLabel?: string;
  value?: string;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
  chevron?: boolean;
  onClick: () => void;
}

export function SettingsRow({
  icon,
  title,
  badge,
  description,
  ariaLabel,
  value,
  destructive,
  disabled = false,
  testId,
  chevron = true,
  onClick,
}: SettingsRowProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      data-testid={testId}
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors enabled:hover:bg-chip/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Leading icon={icon} destructive={destructive && !disabled} />
      <RowText
        title={title}
        badge={badge}
        description={description}
        destructive={destructive}
        disabled={disabled}
      />
      {value && (
        <span className="shrink-0 text-sm text-ink-muted">{value}</span>
      )}
      {chevron && (
        <ChevronRight className="size-4 shrink-0 text-ink-muted/70 transition-colors group-hover:text-ink-muted" />
      )}
    </button>
  );
}

interface SettingsControlRowProps {
  icon?: LucideIcon;
  leading?: ReactNode;
  title: string;
  description?: string;
  destructive?: boolean;
  stack?: boolean;
  children: ReactNode;
}

export function SettingsControlRow({
  icon,
  leading,
  title,
  description,
  destructive,
  stack = false,
  children,
}: SettingsControlRowProps) {
  return (
    <div
      className={cn(
        "flex px-4 py-3",
        stack
          ? "flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-3"
          : "items-center gap-3",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Leading icon={icon} leading={leading} destructive={destructive} />
        <RowText
          title={title}
          description={description}
          destructive={destructive}
        />
      </span>
      <div className={stack ? "md:shrink-0" : "shrink-0"}>{children}</div>
    </div>
  );
}
