import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { SkillPreviewSheetLabels } from "./skill-preview-modal-labels";

/**
 * The optional detail blocks of {@link SkillPreviewModal}: the skill's authored
 * taxonomy (category + tags) and the collapsed-by-default full SKILL.md body.
 * Neither is exported from the package — the modal is the public surface.
 */

type Labels = Required<SkillPreviewSheetLabels>;

/**
 * Category + tags. The category is the skill's ONE authored classification, so
 * it reads as an outlined chip under its own heading; the free-form tags stay
 * the soft filled pills, keeping the two visually distinct at a glance.
 */
export function SkillPreviewTaxonomy({
  category,
  tags,
  labels: l,
}: {
  category: string | null;
  tags: string[];
  labels: Labels;
}) {
  if (!category && tags.length === 0) return null;
  return (
    <div className="space-y-3">
      {category && (
        <div>
          <p className="mb-2 font-medium text-ink-muted text-xs">
            {l.categoryHeading}
          </p>
          <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 font-medium text-ink text-xs">
            {l.formatCategory(category)}
          </span>
        </div>
      )}
      {tags.length > 0 && (
        <div>
          <p className="mb-2 font-medium text-ink-muted text-xs">
            {l.tagsHeading}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-chip px-2.5 py-0.5 text-ink text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The skill's full SKILL.md body behind an always-visible expander (never a
 * hover-gated affordance). Collapsed by default so the modal opens at its
 * familiar size; expanded, the raw markdown gets the same read-only monospace
 * treatment as the installed skill's editor, height-capped with its own scroll
 * so a long skill grows the dialog by a bounded amount instead of running off
 * the screen. The reveal is instant: this repo compiles no enter/exit animate
 * utilities, and an immediate toggle is the right call for a high-frequency
 * disclosure anyway.
 */
export function SkillPreviewInstructions({
  content,
  labels: l,
}: {
  content: string;
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex items-center gap-1.5 rounded-full font-medium text-ink-muted text-sm transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none">
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
        {open ? l.hideInstructions : l.viewInstructions}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 outline-none">
        {/* A focusable landmark with a stable name: overflow panes are not
            keyboard-reachable by default (WKWebView/Gecko), so tabIndex lets
            keyboard users scroll a long body; the aria-label stays constant
            while the trigger's text toggles. */}
        <section
          aria-label={l.instructionsHeading}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a height-capped scroll pane must be focusable or keyboard users cannot scroll it (WCAG 2.1.1); the aria-label names the region.
          tabIndex={0}
          className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-line/20 bg-input px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <pre className="whitespace-pre-wrap break-words font-mono text-ink text-sm leading-relaxed">
            {content}
          </pre>
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}
