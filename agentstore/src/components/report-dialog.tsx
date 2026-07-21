"use client";

import { StoreApiError } from "@houston/agentstore-client";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Spinner,
  Textarea,
} from "@houston-ai/core";
import { Flag } from "lucide-react";
import * as React from "react";
import { reportAgent } from "@/lib/store-client";
import {
  ERROR_COPY,
  ReasonRadioGroup,
  type ReasonValue,
  ReportSuccess,
} from "./report-dialog-parts";

export interface ReportDialogProps {
  /** The published agent's slug (path segment for the report endpoint). */
  slug: string;
  /** Agent display name, woven into the dialog copy. */
  agentName: string;
}

/**
 * The "Report this agent" affordance on the detail page: an always-visible, quiet
 * ghost button that opens a modal with a reason radio group, optional details, and
 * an optional contact. Submits to the gateway (POST /v1/agentstore/agents/:slug/reports
 * via `reportAgent`) and shows explicit success and error states. No hover-only
 * affordances; fully keyboard-operable.
 */
export function ReportDialog({ slug, agentName }: ReportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ReasonValue | null>(null);
  const [details, setDetails] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success">(
    "idle",
  );
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setReason(null);
    setDetails("");
    setContact("");
    setStatus("idle");
    setError(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      await reportAgent(slug, {
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(contact.trim() ? { contact: contact.trim() } : {}),
      });
      setStatus("success");
    } catch (err) {
      if (err instanceof StoreApiError) {
        // Prefer the gateway's error token, then the numeric status (e.g. the
        // rate-limit token "rate limited" has no copy of its own but 429 does).
        setError(
          (err.code ? ERROR_COPY[err.code] : undefined) ??
            ERROR_COPY[String(err.status)] ??
            "We could not submit your report. Please try again.",
        );
      } else {
        setError("Network error. Please check your connection and try again.");
      }
      setStatus("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <Flag aria-hidden className="size-3.5" />
          Report this agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        {status === "success" ? (
          <ReportSuccess
            agentName={agentName}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Report {agentName}</DialogTitle>
              <DialogDescription>
                Tell us what is wrong. Reports are private and help us keep the
                store safe.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <ReasonRadioGroup value={reason} onChange={setReason} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-details" className="text-sm font-medium">
                Details{" "}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="What happened, and where?"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-contact" className="text-sm font-medium">
                Your contact{" "}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="report-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={200}
                placeholder="Email or handle, if we can follow up"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" && <Spinner className="size-4" />}
                Submit report
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
