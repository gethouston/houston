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
        title={labels.favorites}
        onClick={() => onSelect("fav")}
      >
        <Star className="size-4" />
      </RailButton>
      <RailButton
        active={active === "all"}
        title={labels.all}
        onClick={() => onSelect("all")}
      >
        <Boxes className="size-4" />
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
      title={
        disconnected
          ? `${provider.name} · ${labels.notConnected}`
          : provider.name
      }
      dimmed={disconnected}
      onClick={() => onSelect(provider.id)}
    >
      <ProviderIcon
        providerId={provider.id}
        name={provider.name}
        render={renderProviderIcon}
        className="size-[26px] rounded-lg text-muted-foreground"
      />
    </RailButton>
  );
}

function RailButton({
  active,
  title,
  dimmed,
  onClick,
  children,
}: {
  active: boolean;
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
        "relative inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
        dimmed && "opacity-45",
      )}
    >
      {active && (
        <span className="absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-full bg-foreground" />
      )}
      {children}
    </button>
  );
}
