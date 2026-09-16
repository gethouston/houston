import { cn } from "@houston-ai/core";
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
  disabled?: boolean;
}

function RowText({ title, description, destructive, disabled }: RowTextProps) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate text-sm font-medium ${
          destructive && !disabled ? "text-danger" : "text-ink"
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
  disabled?: boolean;
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
  /** Replaces the icon (e.g. an avatar). */
  leading?: ReactNode;
  title: string;
  description?: string;
  destructive?: boolean;
  /**
   * Give the control its OWN full-width line under the label on phones (it
   * keeps the right seat from `md:` up). For a control whose value is a phrase
   * the user wrote — an industry, a job title — which would otherwise be
   * squeezed into whatever the label leaves of a 360px row. A toggle or a
   * short menu stays beside its label and leaves this off.
   */
  stack?: boolean;
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
      {/* The mark and the words are ONE line whichever way the row runs, so a
          stacked row never drops its icon onto a line of its own. */}
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
