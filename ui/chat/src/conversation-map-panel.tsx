import { Button, cn } from "@houston-ai/core";
import { ArrowDownIcon, MapIcon, XIcon } from "lucide-react";
import type { ResolvedConversationMapLabels } from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";

interface ConversationMapPanelProps {
  activeMessageKey: string | null;
  labels: ResolvedConversationMapLabels;
  moments: ConversationMoment[];
  open: boolean;
  onBackToLatest: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectMoment: (moment: ConversationMoment) => void;
}

export function ConversationMapPanel({
  activeMessageKey,
  labels,
  moments,
  open,
  onBackToLatest,
  onOpenChange,
  onSelectMoment,
}: ConversationMapPanelProps) {
  if (moments.length < 3) return null;

  return (
    <>
      {!open && (
        <Button
          aria-label={labels.view}
          className="absolute right-4 top-3 z-20 rounded-full"
          onClick={() => onOpenChange(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <MapIcon className="size-4" />
          {labels.view}
        </Button>
      )}
      {open && (
        <aside
          aria-label={labels.title}
          className="absolute right-4 top-3 z-20 flex max-h-[70%] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border bg-background/80 shadow-xl backdrop-blur-md md:w-72"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-medium text-sm">{labels.title}</h2>
            <Button
              aria-label={labels.hide}
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
          <nav
            aria-label={labels.title}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            <ol className="flex flex-col gap-1">
              {moments.map((moment) => {
                const active = activeMessageKey === moment.messageKey;
                return (
                  <li key={moment.id}>
                    <button
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        active
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                      onClick={() => onSelectMoment(moment)}
                      type="button"
                    >
                      <span className="text-xs">
                        {labels.types[moment.type]}
                      </span>
                      <span className="line-clamp-2 text-foreground">
                        {moment.preview || labels.types[moment.type]}
                      </span>
                      <span className="text-xs">
                        {labels.messagePosition(moment.position)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="border-t p-3">
            <Button
              className="w-full justify-start"
              onClick={onBackToLatest}
              size="sm"
              type="button"
              variant="outline"
            >
              <ArrowDownIcon className="size-4" />
              {labels.backToLatest}
            </Button>
          </div>
          <span className="sr-only" role="status">
            {activeMessageKey ? labels.selected : ""}
          </span>
        </aside>
      )}
    </>
  );
}
