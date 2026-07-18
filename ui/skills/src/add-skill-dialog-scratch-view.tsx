/**
 * ScratchView — third tab of AddSkillDialog. Lets a non-technical user
 * author a skill by hand: title (free-form phrase the founder would say
 * in chat), description (one-liner for the card), procedure body
 * (markdown the agent follows).
 *
 * The on-disk skill name is a kebab-case slug derived from the title.
 * We render the derived slug below the title field so the user sees
 * exactly what their skill will be called inside Houston — no surprises.
 */

import { Button, cn } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import {
  cloneElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canSubmitScratchForm,
  needsDescriptionNudge,
  toSlug,
} from "./add-skill-dialog-scratch-model";

export interface ScratchViewLabels {
  titleLabel?: string;
  titlePlaceholder?: string;
  titleHint?: string;
  slugPreviewPrefix?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  descriptionHint?: string;
  bodyLabel?: string;
  bodyPlaceholder?: string;
  bodyHint?: string;
  submit?: string;
  submitting?: string;
  errorTitleRequired?: string;
  errorDescriptionRequired?: string;
  errorBodyRequired?: string;
  errorSlugTaken?: string;
}

const DEFAULT_LABELS: Required<ScratchViewLabels> = {
  titleLabel: "What should this skill do?",
  titlePlaceholder: "Draft a contract",
  titleHint: "Use the phrase you'd say in chat. Houston turns it into a slug.",
  slugPreviewPrefix: "Saved as",
  descriptionLabel: "One-line description",
  descriptionPlaceholder: "Drafts a starter contract you can review and sign.",
  descriptionHint:
    "Shown on the skill card. Say what the user gets, not how it works.",
  bodyLabel: "Instructions for the agent",
  bodyPlaceholder:
    "## Procedure\n\n1. Ask the user what kind of contract.\n2. Pull the latest version from Drive.\n3. Fill it in and share for review.\n",
  bodyHint: "Markdown. The agent reads this when the skill runs.",
  submit: "Create skill",
  submitting: "Creating...",
  errorTitleRequired: "Give your skill a title.",
  errorDescriptionRequired:
    "A description is required. Add one line saying what this skill does.",
  errorBodyRequired: "Add at least one instruction step.",
  errorSlugTaken: "A skill with this name already exists.",
};

export interface ScratchViewProps {
  /**
   * Returns the created skill's slug (or rejects with an error). The
   * dialog closes when this resolves; the caller is responsible for
   * surfacing toast confirmation.
   */
  onCreate: (input: {
    name: string;
    description: string;
    content: string;
  }) => Promise<string>;
  /** Lowercase slugs already on disk — used to flag collisions inline. */
  installedSkillNames?: Set<string>;
  labels?: ScratchViewLabels;
  /** Reset internal form state when the dialog re-opens. */
  resetKey?: number;
}

export function ScratchView({
  onCreate,
  installedSkillNames,
  labels,
  resetKey,
}: ScratchViewProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is a prop whose changing value is the intentional trigger; Biome incorrectly classifies it as a non-reactive outer-scope value
  useEffect(() => {
    setTitle("");
    setDescription("");
    setDescriptionTouched(false);
    setBody("");
    setError(null);
    // Defer focus past the dialog's mount animation so the cursor
    // actually lands inside the input.
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [resetKey]);

  const slug = useMemo(() => toSlug(title), [title]);
  const slugTaken =
    slug.length > 0 && installedSkillNames?.has(slug.toLowerCase()) === true;

  const descriptionMissing = needsDescriptionNudge(
    { title, description, body },
    descriptionTouched,
  );

  const canSubmit =
    canSubmitScratchForm({ title, description, body }, slugTaken) &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(l.errorTitleRequired);
      return;
    }
    if (!description.trim()) {
      // The inline message under the field carries the explanation.
      setDescriptionTouched(true);
      setError(null);
      return;
    }
    if (!body.trim()) {
      setError(l.errorBodyRequired);
      return;
    }
    if (slugTaken) {
      setError(l.errorSlugTaken);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name: slug,
        description: description.trim(),
        content: body,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col min-h-0 flex-1 overflow-hidden"
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
        <Field
          label={l.titleLabel}
          hint={l.titleHint}
          suffix={
            slug ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  slugTaken ? "text-red-600" : "text-ink-muted",
                )}
              >
                {l.slugPreviewPrefix} <code>{slug}</code>
              </span>
            ) : null
          }
        >
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={l.titlePlaceholder}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field
          label={l.descriptionLabel}
          hint={l.descriptionHint}
          error={descriptionMissing ? l.errorDescriptionRequired : null}
        >
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setDescriptionTouched(true)}
            placeholder={l.descriptionPlaceholder}
            className={inputClass}
            autoComplete="off"
            maxLength={200}
            aria-invalid={descriptionMissing || undefined}
          />
        </Field>

        <Field label={l.bodyLabel} hint={l.bodyHint}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={l.bodyPlaceholder}
            rows={8}
            className={cn(inputClass, "resize-none font-mono text-xs")}
          />
        </Field>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <footer className="shrink-0 border-t border-line/30 px-6 py-3 flex justify-end">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {l.submitting}
            </>
          ) : (
            l.submit
          )}
        </Button>
      </footer>
    </form>
  );
}

const inputClass = cn(
  "w-full rounded-lg border border-line/20 bg-input px-3 py-2 text-sm",
  "text-ink placeholder:text-ink-muted/60",
  "outline-none focus:shadow-sm transition-shadow",
);

function Field({
  label,
  hint,
  error,
  suffix,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  suffix?: React.ReactNode;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">
          {label}
        </label>
        {suffix}
      </div>
      {cloneElement(children, { id })}
      {error ? (
        <p role="alert" className="text-xs text-red-600 mt-1">
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-ink-muted/70 mt-1">{hint}</p>
      )}
    </div>
  );
}
