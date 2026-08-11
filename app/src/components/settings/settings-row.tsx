import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SettingsCardProps {
  /** Group heading shown above the card. Omit for the lead group. */
  title?: string;
  children: ReactNode;
}

interface SettingsGroupTitleProps {
  children: ReactNode;
  className?: string;
}

/** The heading grammar shared by every settings-style card group. */
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

/** A titled group of settings rows, rendered as one hairline-divided card. */
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

function Leading({
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

interface RowTextProps {
  title: string;
  description?: string;
  destructive?: boolean;
}

function RowText({ title, description, destructive }: RowTextProps) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate text-sm font-medium ${
          destructive ? "text-danger" : "text-ink"
        }`}
      >
        {title}
      </span>
      {description && (
        <span className="block truncate text-xs text-ink-muted">
          {description}
        </span>
      )}
    </span>
  );
}

interface SettingsRowProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  ariaLabel?: string;
  /** Right-aligned current value, e.g. "2 members". */
  value?: string;
  destructive?: boolean;
  /** Stable `data-testid` for rows the UI tests navigate by (label-independent). */
  testId?: string;
  /** Set false for ACTION rows that resolve in place instead of drilling into
   *  a sub-screen — the chevron promises navigation. Defaults to true. */
  chevron?: boolean;
  onClick: () => void;
}

/** A navigable settings entry: bare icon, title, description, value, chevron. */
export function SettingsRow({
  icon,
  title,
  description,
  ariaLabel,
  value,
  destructive,
  testId,
  chevron = true,
  onClick,
}: SettingsRowProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      data-testid={testId}
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-chip/60"
    >
      <Leading icon={icon} destructive={destructive} />
      <RowText
        title={title}
        description={description}
        destructive={destructive}
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
  /** Replaces the icon (e.g. an avatar). */
  leading?: ReactNode;
  title: string;
  description?: string;
  destructive?: boolean;
  /** The inline control rendered on the right (input, toggle, select, button). */
  children: ReactNode;
}

/** A settings entry resolved in place: bare icon, title, and a right-side control. */
export function SettingsControlRow({
  icon,
  leading,
  title,
  description,
  destructive,
  children,
}: SettingsControlRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Leading icon={icon} leading={leading} destructive={destructive} />
      <RowText
        title={title}
        description={description}
        destructive={destructive}
      />
      <div className="shrink-0">{children}</div>
    </div>
  );
}
