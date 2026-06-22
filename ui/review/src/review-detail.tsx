import { useState } from "react";
import { Button, Input } from "@houston-ai/core";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DeliverableCard, UserFeedback } from "./deliverable-card";

export interface ReviewDetailProps {
  parentLabel: string;
  projectName: string;
  deliverableContent: string;
  onBack: () => void;
  onApprove: (feedback: string) => Promise<void>;
  onSendFeedback?: (text: string) => Promise<void>;
}

interface FeedbackEntry {
  id: string;
  from: "user" | "assistant";
  content: string;
}

export function ReviewDetail({
  parentLabel,
  projectName,
  deliverableContent,
  onBack,
  onApprove,
  onSendFeedback,
}: ReviewDetailProps) {
  const [feedbackText, setFeedbackText] = useState("");
  const [conversation, setConversation] = useState<FeedbackEntry[]>([]);
  const [isRevising, setIsRevising] = useState(false);

  const handleSendFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed || isRevising) return;

    const userEntry: FeedbackEntry = {
      id: `fb-${Date.now()}`,
      from: "user",
      content: trimmed,
    };
    setConversation((prev) => [...prev, userEntry]);
    setFeedbackText("");
    setIsRevising(true);

    try {
      await onSendFeedback?.(trimmed);
    } catch {
      // Caller handles error display
    }

    setIsRevising(false);
  };

  const handleApprove = async () => {
    const allFeedback = conversation
      .filter((e) => e.from === "user")
      .map((e) => e.content)
      .join("\n");
    const combinedFeedback = [allFeedback, feedbackText.trim()]
      .filter(Boolean)
      .join("\n");

    await onApprove(combinedFeedback);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendFeedback();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200"
            aria-label="Back to Review"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {parentLabel}
            </p>
            <p className="text-xs text-muted-foreground">{projectName}</p>
          </div>
        </div>
      </div>

      {/* Body -- scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <DeliverableCard content={deliverableContent} />

          {conversation.map((entry) =>
            entry.from === "user" ? (
              <UserFeedback key={entry.id} content={entry.content} />
            ) : (
              <div key={entry.id} className="space-y-4">
                <p className="text-sm text-foreground">{entry.content}</p>
              </div>
            ),
          )}

          {isRevising && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Revising...
            </div>
          )}
        </div>
      </div>

      {/* Footer -- input + approve button */}
      <div className="shrink-0 px-4 py-3 border-t border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Input
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type feedback..."
            disabled={isRevising}
            className="flex-1 h-10 rounded-full pl-4 border-border"
          />
          <Button
            onClick={handleApprove}
            className="h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
