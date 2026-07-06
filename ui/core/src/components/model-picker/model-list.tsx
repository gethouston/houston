import { Command as CommandPrimitive } from "cmdk";
import { Clock, Loader2, Search, Star } from "lucide-react";
import type * as React from "react";
import { Skeleton } from "../skeleton";
import { ModelRow } from "./model-row";
import type { ModelPickerSectionVM, ModelPickerView } from "./sections";
import type {
  ModelPickerCatalogState,
  ModelPickerLabels,
  ModelPickerProvider,
} from "./types";

/** The scrollable body: grouped/flat rows, plus loading + empty states. */
export function ModelList({
  view,
  providers,
  labels,
  catalogState,
  query,
  selectedId,
  favorites,
  openDetailId,
  renderProviderIcon,
  onSelect,
  onToggleFavorite,
  onToggleDetail,
  onConnect,
}: {
  view: ModelPickerView;
  providers: ReadonlyMap<string, ModelPickerProvider>;
  labels: ModelPickerLabels;
  catalogState: ModelPickerCatalogState;
  query: string;
  selectedId?: string;
  favorites: ReadonlySet<string>;
  openDetailId?: string;
  renderProviderIcon?: (id: string, className?: string) => React.ReactNode;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleDetail: (id: string) => void;
  onConnect?: (providerId: string) => void;
}) {
  // Only take over the whole panel with skeletons on a cold load with nothing
  // to show yet. When ready content already exists (curated providers are always
  // instantly available), render it and signal the still-streaming live catalog
  // with an unobtrusive footer rather than blanking what the user can already use.
  if (catalogState === "loading" && view.sections.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {Array.from({ length: 7 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static skeleton
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  return (
    <CommandPrimitive.List className="flex-1 overflow-y-auto px-2 py-1.5">
      {/* While the live catalog is still loading, an empty result means "still
          searching", not "nothing matches" — suppress the empty state so it never
          shows alongside the LoadingMore footer. The settled ready/offline no-match
          case keeps the empty state. */}
      {catalogState !== "loading" && (
        <CommandPrimitive.Empty className="px-4 py-14 text-center text-sm text-muted-foreground">
          {labels.empty}
          <div className="mt-1 text-xs">{labels.emptyHint}</div>
        </CommandPrimitive.Empty>
      )}
      {view.sections.map((section) => (
        <CommandPrimitive.Group
          key={section.id}
          heading={
            <SectionHeading
              section={section}
              provider={
                section.providerId
                  ? providers.get(section.providerId)
                  : undefined
              }
              labels={labels}
              onConnect={onConnect}
            />
          }
          className="[&_[cmdk-group-heading]]:px-1"
        >
          {section.models.map((model) => (
            <ModelRow
              key={`${section.id}:${model.id}`}
              sectionId={section.id}
              model={model}
              provider={providers.get(model.providerId)}
              query={query}
              selected={model.id === selectedId}
              favorite={favorites.has(model.id)}
              detailOpen={openDetailId === model.id}
              labels={labels}
              renderProviderIcon={renderProviderIcon}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              onToggleDetail={onToggleDetail}
              onConnect={onConnect}
            />
          ))}
        </CommandPrimitive.Group>
      ))}
      {catalogState === "loading" && <LoadingMore label={labels.loading} />}
    </CommandPrimitive.List>
  );
}

/** Unobtrusive footer shown while the live catalog is still streaming in behind
 * already-visible rows — keeps the ready models usable and signals more coming. */
function LoadingMore({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  );
}

function SectionHeading({
  section,
  provider,
  labels,
  onConnect,
}: {
  section: ModelPickerSectionVM;
  provider: ModelPickerProvider | undefined;
  labels: ModelPickerLabels;
  onConnect?: (providerId: string) => void;
}) {
  const { label, icon } = headingText(section, provider, labels);
  const disconnected = provider?.connection === "disconnected";
  return (
    <div className="flex items-center gap-2 pt-2 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
      {icon}
      <span>{label}</span>
      <span className="h-px flex-1 bg-border/60" />
      {provider &&
        (disconnected ? (
          <button
            type="button"
            onClick={() => onConnect?.(provider.id)}
            className="text-[0.7rem] font-semibold text-primary normal-case"
          >
            {labels.connect} →
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground normal-case">
            <span className="size-1.5 rounded-full bg-success" />
            {labels.connected}
          </span>
        ))}
    </div>
  );
}

function headingText(
  section: ModelPickerSectionVM,
  provider: ModelPickerProvider | undefined,
  labels: ModelPickerLabels,
): { label: string; icon: React.ReactNode } {
  switch (section.kind) {
    case "recent":
      return { label: labels.recent, icon: <Clock className="size-3" /> };
    case "favorites":
      return { label: labels.favorites, icon: <Star className="size-3" /> };
    case "provider":
      return { label: provider?.name ?? section.providerId ?? "", icon: null };
    default:
      return { label: labels.results, icon: <Search className="size-3" /> };
  }
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3 px-3 py-2.5 motion-reduce:[&_*]:animate-none">
      <Skeleton className="size-[30px] rounded-lg" />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-3/5" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  );
}
