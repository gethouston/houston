import type { ReactNode } from "react";
import { cn } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";
import type { MissionMeta } from "./mission-frame";

interface MissionChatFrameProps {
  meta: MissionMeta;
  brandLabel: string;
  counterLabel: string;
  /** Always-on escape hatch label, e.g. "Skip". */
  skipLabel: string;
  onSkip: () => void;
  /** Full-bleed ChatPanel goes here. */
  children: ReactNode;
}

/**
 * The final setup step (send an email) is a live chat, but it lives in the same
 * world as the rest of setup: a centered white card on the gray setup backdrop,
 * with a minimal header (brand · counter · skip). So the chat reads as part of
 * the wizard, not a separate full-screen app.
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
    <div className="flex h-screen flex-col items-center bg-secondary/60 px-6 py-6 text-foreground">
      <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl border border-black/10 bg-background shadow-[0_1px_0_rgba(0,0,0,0.05)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-black/5 px-5 py-3">
          <div className="flex items-center gap-2">
            <HoustonLogo size={20} />
            <span className="text-sm font-medium">{brandLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{counterLabel}</span>
            <ProgressDots index={meta.index} total={meta.total} />
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {skipLabel}
          </button>
        </header>
        <main className="flex min-h-0 flex-1 flex-col px-6 py-4">{children}</main>
      </div>
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
