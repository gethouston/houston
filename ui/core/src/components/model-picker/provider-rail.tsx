import { Boxes, Star } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { ProviderIcon } from "./provider-icon";
import type { ModelPickerConnection, ModelPickerLabels } from "./types";

export interface RailProvider {
  id: string;
  name: string;
  connection: ModelPickerConnection;
}

/**
 * Left rail: pinned Favorites + All and the connected providers up top, then a
 * divider and the not-yet-connected providers (dimmed). Monochrome throughout.
 */
export function ProviderRail({
  providers,
  active,
  labels,
  renderProviderIcon,
  onSelect,
}: {
  providers: RailProvider[];
  active: string;
  labels: ModelPickerLabels;
  renderProviderIcon?: (
    providerId: string,
    className?: string,
  ) => React.ReactNode;
  onSelect: (id: string) => void;
}) {
  const connected = providers.filter((p) => p.connection !== "disconnected");
  const disconnected = providers.filter((p) => p.connection === "disconnected");
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/60 py-2.5">
      <RailButton
        active={active === "fav"}
        prominent
        title={labels.favorites}
        onClick={() => onSelect("fav")}
      >
        <Star className="size-3.5" />
      </RailButton>
      <RailButton
        active={active === "all"}
        prominent
        title={labels.all}
        onClick={() => onSelect("all")}
      >
        <Boxes className="size-3.5" />
      </RailButton>
      {connected.map((p) => (
        <ProviderRailButton
          key={p.id}
          provider={p}
          active={active === p.id}
          labels={labels}
          renderProviderIcon={renderProviderIcon}
          onSelect={onSelect}
        />
      ))}
      {disconnected.length > 0 && (
        <div className="my-1 h-px w-6 shrink-0 bg-border" />
      )}
      {disconnected.map((p) => (
        <ProviderRailButton
          key={p.id}
          provider={p}
          active={active === p.id}
          labels={labels}
          renderProviderIcon={renderProviderIcon}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ProviderRailButton({
  provider,
  active,
  labels,
  renderProviderIcon,
  onSelect,
}: {
  provider: RailProvider;
  active: boolean;
  labels: ModelPickerLabels;
  renderProviderIcon?: (id: string, className?: string) => React.ReactNode;
  onSelect: (id: string) => void;
}) {
  const disconnected = provider.connection === "disconnected";
  return (
    <RailButton
      active={active}
      prominent={!disconnected}
      title={
        disconnected
          ? `${provider.name} · ${labels.notConnected}`
          : provider.name
      }
      dimmed={disconnected}
      onClick={() => onSelect(provider.id)}
    >
      {/* No text color here: the glyph inherits the button's currentColor, so a
          connected provider reads as foreground (white on dark) and a
          disconnected one as muted grey. */}
      <ProviderIcon
        providerId={provider.id}
        name={provider.name}
        render={renderProviderIcon}
        className="size-[18px] rounded-md"
      />
    </RailButton>
  );
}

function RailButton({
  active,
  prominent,
  title,
  dimmed,
  onClick,
  children,
}: {
  active: boolean;
  /** Render at full foreground (connected / always-available) vs muted grey. */
  prominent?: boolean;
  title: string;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-accent hover:text-foreground",
        prominent ? "text-foreground" : "text-muted-foreground",
        active && "bg-accent text-foreground",
        dimmed && "opacity-45",
      )}
    >
      {children}
    </button>
  );
}
