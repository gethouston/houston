import type { ReactNode } from "react";
import { cn } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";
import type { MissionMeta } from "./mission-frame";

interface MissionChatFrameProps {
  meta: MissionMeta;
  brandLabel: string;
  counterLabel: string;
  /** Always-on escape hatch label, e.g. "Skip tutorial". */
  skipLabel: string;
  onSkip: () => void;
  /** Full-bleed ChatPanel goes here. */
  children: ReactNode;
}

/**
 * Full-screen chat frame for the back-half missions (Try, Skill, Routine).
 * Replaces the old `MissionWithChatFrame` split layout: the user's
 * attention sits on the chat, all instructional copy lives in an
 * accompanying `MissionIntroModal` rendered on first mount.
 *
 * Header is intentionally minimal — brand left, mission counter + progress
 * dots middle, skip link right. No mission title or up-next hint here;
 * those belong to the intro modal so the chat owns the rest of the
 * viewport.
 */
export function MissionChatFrame({
  meta,
  brandLabel,
  counterLabel,
  skipLabel,
  onSkip,
  children,
}: MissionChatFrameProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-black/5 bg-background/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <HoustonLogo size={20} />
            <span className="text-sm font-medium">{brandLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {counterLabel}
            </span>
            <ProgressDots index={meta.index} total={meta.total} />
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {skipLabel}
          </button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col px-6 py-4">
        {children}
      </main>
    </div>
  );
}

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-full transition-colors",
            i < index && "bg-foreground/60",
            i === index && "bg-foreground",
            i > index && "bg-foreground/15",
          )}
        />
      ))}
    </div>
  );
}
