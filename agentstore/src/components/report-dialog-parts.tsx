"use client";

import { Button, DialogDescription, DialogTitle } from "@houston-ai/core";
import { CheckCircle2 } from "lucide-react";

/** Reason values MUST match the `report_reason` DB enum / report `validate.ts`. */
export const REASONS = [
  { value: "spam", label: "Spam or misleading" },
  { value: "malicious", label: "Malicious or unsafe behavior" },
  { value: "impersonation", label: "Impersonation" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
] as const;

export type ReasonValue = (typeof REASONS)[number]["value"];

/**
 * Reader-facing message keyed by the gateway's error `code` (preferred) or, when
 * the envelope carries no code, by the HTTP status as a string fallback.
 */
export const ERROR_COPY: Record<string, string> = {
  "rate limited": "Too many reports from here. Please try again in a minute.",
  "429": "Too many reports from here. Please try again in a minute.",
  invalid_reason: "Please choose a reason.",
  details_too_long: "Please shorten the details to under 2000 characters.",
  contact_too_long: "Please shorten your contact to under 200 characters.",
  not_found: "This agent is no longer available.",
  "404": "This agent is no longer available.",
};

/** The reason radio group: a labelled fieldset with one selectable row per reason. */
export function ReasonRadioGroup({
  value,
  onChange,
}: {
  value: ReasonValue | null;
  onChange: (value: ReasonValue) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Reason</legend>
      {REASONS.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
        >
          <input
            type="radio"
            name="reason"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-primary"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/** The post-submit confirmation shown in place of the form. */
export function ReportSuccess({
  agentName,
  onDone,
}: {
  agentName: string;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 aria-hidden className="size-8 text-primary" />
      <DialogTitle>Report received</DialogTitle>
      <DialogDescription>
        Thank you. Our team will review {agentName} and take action if it breaks
        the rules.
      </DialogDescription>
      <Button className="mt-2" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
