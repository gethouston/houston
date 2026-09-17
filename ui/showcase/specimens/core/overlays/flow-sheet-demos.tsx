import {
  Button,
  FlowChoiceList,
  FlowChoiceRow,
  FlowSheet,
  type FlowSheetSize,
  Input,
  Stepper,
} from "@houston-ai/core";
import { PenLine, Sparkles } from "lucide-react";
import { useState } from "react";

/**
 * The two live flows the FlowSheet page opens, split out so the page itself
 * stays inside the 200-line rule. A helper module: it exports no specimen, so
 * no family index lists it.
 */

/** Each step's own title, and the frame it needs to ask for what it asks. */
const STEPS: {
  id: string;
  label: string;
  title: string;
  size: FlowSheetSize;
}[] = [
  {
    id: "source",
    label: "Source",
    title: "How do you want to start?",
    size: "compact",
  },
  {
    id: "content",
    label: "Content",
    title: "New agent",
    size: "wide",
  },
  {
    id: "name",
    label: "Name",
    title: "Give it a name",
    size: "compact",
  },
];

/** The create-agent flow, cut down to the three screens it really has. */
export function CopyAgentFlow({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const step = STEPS[index];

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <FlowSheet
        open={open}
        onOpenChange={setOpen}
        size={step.size}
        title={step.title}
        back={
          index > 0
            ? { label: "Back", onClick: () => setIndex(index - 1) }
            : undefined
        }
        progress={
          <Stepper
            steps={STEPS.map(({ id, label: name }) => ({ id, label: name }))}
            activeStep={step.id}
            completedSteps={STEPS.slice(0, index).map((one) => one.id)}
          />
        }
        footer={
          step.id === "source" ? undefined : (
            <div className="flex items-center justify-end">
              <Button
                onClick={() =>
                  index === STEPS.length - 1
                    ? setOpen(false)
                    : setIndex(index + 1)
                }
              >
                {index === STEPS.length - 1 ? "Create agent" : "Continue"}
              </Button>
            </div>
          )
        }
      >
        {step.id === "source" && (
          <FlowChoiceList>
            <FlowChoiceRow
              icon={<PenLine />}
              title="Start from scratch"
              onClick={() => setIndex(1)}
            />
            <FlowChoiceRow
              icon={<Sparkles />}
              title="Copy an agent"
              onClick={() => setIndex(1)}
            />
          </FlowChoiceList>
        )}
        {step.id === "content" && (
          <p className="text-ink-muted text-sm">
            A catalog to scan takes the tall frame, and carries its own headline
            over the list.
          </p>
        )}
        {step.id === "name" && (
          <Input defaultValue="Inbox Zero" aria-label="Agent name" />
        )}
      </FlowSheet>
    </>
  );
}

/** One wide screen with nothing to report: the title takes the centre slot. */
export function PlainFlow({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FlowSheet
        open={open}
        onOpenChange={setOpen}
        size="wide"
        title="Connect Gmail"
        showTitle
        headerAside={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Skip
          </Button>
        }
      >
        <p className="text-ink-muted text-sm">
          One screen, no progress to report — `showTitle` gives the centre slot
          to the title and the row keeps its shape.
        </p>
      </FlowSheet>
    </>
  );
}
