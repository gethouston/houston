import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface SkillInstructionsDisclosureLabels {
  /** Collapsed-state trigger. */
  show?: string;
  /** Expanded-state trigger. */
  hide?: string;
}

export interface SkillInstructionsDisclosureProps {
  labels?: SkillInstructionsDisclosureLabels;
  /** The raw SKILL.md body — a reader pane, or an editor. */
  children: ReactNode;
  className?: string;
}

/**
 * What the trigger says, which is the whole of the disclosure's state.
 *
 * Its own function so the pairing — closed says "show", open says "hide" — is
 * pinned by a test; rendered, the two faces are one `useState` apart and a
 * swap between them reads as correct code.
 */
export function instructionsTriggerLabel(
  open: boolean,
  labels?: SkillInstructionsDisclosureLabels,
): string {
  return open
    ? (labels?.hide ?? "Hide instructions")
    : (labels?.show ?? "Show instructions");
}

/**
 * The one way a skill's raw instructions are reached once the workflow steps
 * are the body: a ghost pill that is always visible (never a hover-gated
 * affordance), collapsed by default so a surface opens at its familiar size.
 * The reveal is instant — a high-frequency disclosure should not animate.
 */
export function SkillInstructionsDisclosure({
  labels,
  children,
  className,
}: SkillInstructionsDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-ink-muted"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
          {instructionsTriggerLabel(open, labels)}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 outline-none">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
