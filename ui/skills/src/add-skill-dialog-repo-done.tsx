import { Button } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { RepoViewLabels } from "./add-skill-dialog-repo-labels";

export function RepoDoneState({
  installed,
  labels,
  onReset,
}: {
  installed: string[];
  labels: Required<RepoViewLabels>;
  onReset: () => void;
}) {
  return (
    <div className="px-6 space-y-3">
      <div className="flex items-center gap-2 text-sm text-ink">
        <Check className="size-4 text-emerald-600 shrink-0" />
        <span>
          {labels.installedSummary(installed.length, installed.join(", "))}
        </span>
      </div>
      <Button
        variant="outline"
        onClick={onReset}
        className="rounded-full w-full"
      >
        {labels.installAnotherRepo}
      </Button>
    </div>
  );
}
