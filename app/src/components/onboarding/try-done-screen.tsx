import { ArrowRight } from "lucide-react";
import { MessageResponse } from "@houston-ai/chat";
import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";

interface TryDoneScreenProps {
  brandLabel: string;
  assistantName: string;
  assistantColor: string;
  title: string;
  reportMarkdown: string;
  continueLabel: string;
  onContinue: () => void;
}

export function TryDoneScreen({
  brandLabel,
  assistantName,
  assistantColor,
  title,
  reportMarkdown,
  continueLabel,
  onContinue,
}: TryDoneScreenProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <HoustonLogo size={24} />
          <span className="text-sm font-medium">{brandLabel}</span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <HoustonAvatar
              color={resolveAgentColor(assistantColor)}
              diameter={48}
              running
            />
            <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">{assistantName}</p>
          </div>
          <article className="prose prose-sm max-w-none rounded-xl border border-black/5 bg-secondary/30 p-6">
            <MessageResponse>{reportMarkdown}</MessageResponse>
          </article>
        </div>
      </main>
      <footer className="shrink-0 border-t border-black/5 bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl justify-center">
          <Button className="rounded-full px-6" onClick={onContinue}>
            {continueLabel}
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
