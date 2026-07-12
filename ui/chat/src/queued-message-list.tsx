import { Clock3Icon, XIcon } from "lucide-react";

export interface QueuedChatMessage {
  id: string;
  text: string;
  attachmentNames?: string[];
}

export interface QueuedMessageLabels {
  title?: string;
  remove?: string;
  attachmentsOnly?: string;
}

export interface QueuedMessageListProps {
  messages: QueuedChatMessage[];
  onRemove?: (id: string) => void;
  labels?: QueuedMessageLabels;
}

export function QueuedMessageList({
  messages,
  onRemove,
  labels,
}: QueuedMessageListProps) {
  if (messages.length === 0) return null;

  const title = labels?.title ?? "Queued";
  const remove = labels?.remove ?? "Remove queued message";
  const attachmentsOnly = labels?.attachmentsOnly ?? "Attachments";

  return (
    <div className="mb-2 rounded-lg border border-line/70 bg-chip-subtle/35 px-3 py-2 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
        <Clock3Icon className="size-3" />
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">
        {messages.map((message) => {
          const hasText = message.text.trim().length > 0;
          const names = message.attachmentNames ?? [];
          return (
            <div
              key={message.id}
              className="flex min-w-0 items-start gap-2 rounded-md border border-line/50 bg-input/80 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="max-h-12 overflow-hidden whitespace-pre-wrap break-words text-xs leading-5 text-ink">
                  {hasText ? message.text : attachmentsOnly}
                </p>
                {names.length > 0 && (
                  <p className="mt-0.5 truncate text-[11px] leading-4 text-ink-muted">
                    {names.join(", ")}
                  </p>
                )}
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(message.id)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                  aria-label={remove}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
