import { cn } from "@houston-ai/core";
import ReactMarkdown from "react-markdown";

export function DeliverableCard({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-line bg-input p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="prose prose-sm prose-stone max-w-none text-ink">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

export function UserFeedback({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[70%] rounded-3xl bg-chip-subtle px-5 py-2.5",
          "text-sm text-ink",
        )}
      >
        {content}
      </div>
    </div>
  );
}
