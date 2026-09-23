import { cn } from "@houston-ai/core";
import ReactMarkdown from "react-markdown";

export function DeliverableCard({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-line bg-input p-6 shadow-edge">
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
