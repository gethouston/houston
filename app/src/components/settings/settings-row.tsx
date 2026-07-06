import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SettingsCardProps {
  /** Group heading shown above the card. Omit for the lead group. */
  title?: string;
  children: ReactNode;
}

/** A titled group of settings rows, rendered as one hairline-divided card. */
export function SettingsCard({ title, children }: SettingsCardProps) {
  return (
    <section>
      {title && (
        <h2 className="mb-3 px-1 text-base font-semibold text-foreground">
          {title}
        </h2>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
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
        destructive ? "text-destructive" : "text-muted-foreground"
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
          destructive ? "text-destructive" : "text-foreground"
        }`}
      >
        {title}
      </span>
      {description && (
        <span className="block truncate text-xs text-muted-foreground">
          {description}
        </span>
      )}
    </span>
  );
}

interface SettingsRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Right-aligned current value, e.g. "2 members". */
  value?: string;
  destructive?: boolean;
  onClick: () => void;
}

/** A navigable settings entry: bare icon, title, description, value, chevron. */
export function SettingsRow({
  icon,
  title,
  description,
  value,
  destructive,
  onClick,
}: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/60"
    >
      <Leading icon={icon} destructive={destructive} />
      <RowText
        title={title}
        description={description}
        destructive={destructive}
      />
      {value && (
        <span className="shrink-0 text-sm text-muted-foreground">{value}</span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-muted-foreground" />
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
