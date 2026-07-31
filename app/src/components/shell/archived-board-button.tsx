import { Button } from "@houston-ai/core";
import { Archive } from "lucide-react";

interface ArchivedBoardButtonProps {
  /** Visible text on the pill, e.g. "Archived". */
  label: string;
  onClick: () => void;
}

/**
 * The door to an agent's archived missions: a labelled pill floating over the
 * board's bottom-right corner. It wears its name in TEXT rather than hiding it
 * on a tooltip, because an unlabelled round icon read as decoration and nobody
 * found the archive behind it (HOU-1043).
 *
 * Entry only. It disappears while the archived list is showing, where the
 * header's back button is the single, obvious way out; a button that quietly
 * changed meaning depending on an outline was the other half of that bug.
 */
export function ArchivedBoardButton({
  label,
  onClick,
}: ArchivedBoardButtonProps) {
  return (
    <Button
      type="button"
      data-tour-target="archivedMissions"
      variant="outline"
      // Pinned to the opaque input surface in BOTH themes: the pill floats over
      // mission cards, and the outline variant's translucent dark fill would
      // let them bleed through it.
      className="absolute right-6 bottom-6 z-20 gap-1.5 bg-input dark:bg-input active:scale-95"
      onClick={onClick}
    >
      <Archive className="size-4" />
      {label}
    </Button>
  );
}
