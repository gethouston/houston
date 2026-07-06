import { Sparkles, Star } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { ProviderIcon } from "./provider-icon";
import type { ModelPickerConnection, ModelPickerLabels } from "./types";

export interface RailProvider {
  id: string;
  name: string;
  count: number;
  connection: ModelPickerConnection;
}

/** Left rail: pinned Favorites + All, then one button per provider with models. */
export function ProviderRail({
  providers,
  favoritesCount,
  totalCount,
  active,
  labels,
  renderProviderIcon,
  onSelect,
}: {
  providers: RailProvider[];
  favoritesCount: number;
  totalCount: number;
  active: string;
  labels: ModelPickerLabels;
  renderProviderIcon?: (
    providerId: string,
    className?: string,
  ) => React.ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/60 py-2.5">
      <RailButton
        active={active === "fav"}
        title={labels.favorites}
        count={favoritesCount}
        onClick={() => onSelect("fav")}
      >
        <Star className="size-4" style={{ color: "var(--ht-star)" }} />
      </RailButton>
      <RailButton
        active={active === "all"}
        title={labels.all}
        count={totalCount}
        onClick={() => onSelect("all")}
      >
        <Sparkles className="size-4" />
      </RailButton>
      <div className="my-1 h-px w-6 shrink-0 bg-border" />
      {providers.map((p) => {
        const disconnected = p.connection === "disconnected";
        return (
          <RailButton
            key={p.id}
            active={active === p.id}
            title={disconnected ? `${p.name} · ${labels.notConnected}` : p.name}
            count={p.count}
            dimmed={disconnected}
            onClick={() => onSelect(p.id)}
          >
            <ProviderIcon
              providerId={p.id}
              name={p.name}
              render={renderProviderIcon}
              className="size-[26px] rounded-lg"
            />
          </RailButton>
        );
      })}
    </div>
  );
}

function RailButton({
  active,
  title,
  count,
  dimmed,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  count: number;
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
        "relative inline-flex size-10 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "border-primary/40 bg-primary/10 text-primary",
        dimmed && "opacity-55 grayscale",
      )}
    >
      {active && (
        <span className="absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
      )}
      {children}
      <span className="absolute -right-1 -bottom-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-lg border border-border bg-secondary px-1 text-[9px] font-bold text-muted-foreground tabular-nums">
        {count}
      </span>
    </button>
  );
}
