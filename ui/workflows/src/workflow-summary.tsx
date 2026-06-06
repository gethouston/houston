/**
 * WorkflowSummary — renders workflow synthesis / step summary markdown.
 */
import { MessageResponse } from "@houston-ai/chat"
import { cn } from "@houston-ai/core"

const MARKDOWN_BODY = [
  "text-sm leading-relaxed text-foreground",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-3 [&_p:first-child]:mt-0",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
  "[&_li]:pl-0.5",
  "[&_strong]:font-semibold",
  "[&_h1]:text-base [&_h1]:font-medium [&_h1]:mt-5 [&_h1]:mb-2",
  "[&_h2]:text-sm [&_h2]:font-medium [&_h2]:mt-4 [&_h2]:mb-2",
  "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1.5",
  "[&_hr]:my-4 [&_hr]:border-border/40",
].join(" ")

export interface WorkflowSummaryProps {
  content: string
  className?: string
}

export function WorkflowSummary({ content, className }: WorkflowSummaryProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-black/[0.04] bg-background px-4 py-4",
        "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <div className={cn("max-w-none", MARKDOWN_BODY)}>
        <MessageResponse>{content}</MessageResponse>
      </div>
    </div>
  )
}
