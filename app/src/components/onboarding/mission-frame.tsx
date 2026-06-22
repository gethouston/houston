import type { ReactNode } from "react";
import { cn } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";

export interface MissionMeta {
  index: number;
  total: number;
  eyebrow: string;
  title: string;
  body: string;
  nextTitle: string | null;
}

interface MissionFrameProps {
  meta: MissionMeta;
  children: ReactNode;
  brandLabel: string;
  counterLabel: string;
  upNextLabel: string;
}

export function MissionFrame({
  meta,
  children,
  brandLabel,
  counterLabel,
  upNextLabel,
}: MissionFrameProps) {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <HoustonLogo size={24} />
            <span className="text-sm font-medium">{brandLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {counterLabel}
            </span>
            <ProgressDots index={meta.index} total={meta.total} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-3xl flex-col px-5 pb-12 pt-8">
        <header>
          <p className="text-xs text-muted-foreground">{meta.eyebrow}</p>
          <h1 className="mt-2 text-[28px] font-normal leading-tight">
            {meta.title}
          </h1>
          <p className="mt-3 text-base text-muted-foreground">{meta.body}</p>
          {meta.nextTitle && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="text-foreground/80">{upNextLabel}</span>{" "}
              <span aria-hidden>·</span> {meta.nextTitle}
            </p>
          )}
        </header>
        <section className="mt-8 flex flex-1 flex-col">{children}</section>
      </main>
    </div>
  );
}

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional indicators with no stable id; order never changes
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
