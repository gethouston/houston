import { cn } from "@houston-ai/core";
import { InstallStatusIcon } from "./install-status-icon";
import { SkillInstructionsDisclosure } from "./skill-instructions-disclosure";
import type { SkillPreviewSheetLabels } from "./skill-preview-modal-labels";

/**
 * The blocks of {@link SkillPreviewModal}: the skill's authored taxonomy
 * (category + tags), the collapsed-by-default full SKILL.md body, and the
 * install action. None is exported from the package — the modal is the public
 * surface.
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
 * The skill's full SKILL.md body behind an always-visible disclosure — the
 * secondary read of the skill once its workflow steps are the primary body,
 * and the only one an imported skill has. Expanded, the raw markdown gets the
 * same read-only monospace treatment as the installed skill's editor,
 * height-capped with its own scroll so a long skill grows the dialog by a
 * bounded amount instead of running off the screen.
 */
export function SkillPreviewInstructions({
  content,
  labels: l,
}: {
  content: string;
  labels: Labels;
}) {
  return (
    <SkillInstructionsDisclosure
      labels={{ show: l.viewInstructions, hide: l.hideInstructions }}
    >
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
    </SkillInstructionsDisclosure>
  );
}

/**
 * The modal's one action. It stays enabled after a failed description fetch —
 * a load error never blocks installing — and locks only while the install is
 * in flight or already done.
 */
export function SkillPreviewInstallButton({
  installing,
  installed,
  onInstall,
  labels: l,
}: {
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  labels: Labels;
}) {
  return (
    <button
      type="button"
      onClick={onInstall}
      disabled={installing || installed}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-action font-medium text-action-text text-sm transition-colors hover:bg-action/90",
        (installing || installed) && "opacity-60",
        installing && "cursor-wait",
      )}
    >
      {installing ? (
        <>
          <InstallStatusIcon status="installing" className="size-4" />
          {l.installing}
        </>
      ) : installed ? (
        <>
          <InstallStatusIcon status="installed" className="size-4" />
          {l.installed}
        </>
      ) : (
        l.install
      )}
    </button>
  );
}
