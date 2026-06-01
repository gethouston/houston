import { useState } from "react";
import {
  ConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { Archive } from "lucide-react";

interface ArchiveDoneButtonLabels {
  tooltip: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmAction: string;
  cancel: string;
}

interface ArchiveDoneButtonProps {
  /** Archive every Done mission. */
  onConfirm: () => void;
  labels: ArchiveDoneButtonLabels;
}

/**
 * Archive-icon button rendered in the Done column header. Confirms before
 * archiving every mission currently in Done (issue #360). The Done count is
 * baked into `labels.confirmDescription` by the caller.
 */
export function ArchiveDoneButton({ onConfirm, labels }: ArchiveDoneButtonProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={labels.tooltip}
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          >
            <Archive className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{labels.tooltip}</TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={labels.confirmTitle}
        description={labels.confirmDescription}
        confirmLabel={labels.confirmAction}
        cancelLabel={labels.cancel}
        variant="default"
        onConfirm={() => {
          onConfirm();
          setConfirming(false);
        }}
      />
    </>
  );
}
