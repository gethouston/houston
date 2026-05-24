import { Paperclip } from "lucide-react";
import type {
  AttachmentInvocation,
  AttachmentReference,
} from "./attachment-message";

export interface UserAttachmentMessageLabels {
  attachmentCount?: (count: number) => string;
}

interface UserAttachmentMessageProps {
  invocation: AttachmentInvocation;
  labels?: UserAttachmentMessageLabels;
}

interface UserAttachmentBadgeProps {
  files: readonly AttachmentReference[];
  labels?: UserAttachmentMessageLabels;
}

export function UserAttachmentMessage({
  invocation,
  labels,
}: UserAttachmentMessageProps) {
  const message = invocation.message.trim();
  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      {message.length > 0 && (
        <div className="inline-block max-w-full rounded-2xl bg-secondary px-4 py-2.5 text-left text-sm leading-6 text-foreground">
          <span className="whitespace-pre-wrap break-words">{message}</span>
        </div>
      )}
      <UserAttachmentBadge files={invocation.files} labels={labels} />
    </div>
  );
}

export function UserAttachmentBadge({
  files,
  labels,
}: UserAttachmentBadgeProps) {
  if (files.length === 0) return null;
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
      title={files.map((file) => file.name).join(", ")}
    >
      <Paperclip
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="truncate">
        {attachmentCountLabel(files.length, labels)}
      </span>
    </div>
  );
}

function attachmentCountLabel(
  count: number,
  labels: UserAttachmentMessageLabels | undefined,
): string {
  if (labels?.attachmentCount) return labels.attachmentCount(count);
  return count === 1 ? "1 file attached" : `${count} files attached`;
}
