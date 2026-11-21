import { Dialog, DialogContent } from "@houston-ai/core";
import type { ReactNode } from "react";
import { LessonBeatChrome } from "./lesson-beat-chrome";

export function LessonDockedPanel({
  label,
  position,
  total,
  onExit,
  children,
}: {
  label: string;
  position: number;
  total: number;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        aria-label={label}
        aria-labelledby={undefined}
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
      >
        <LessonBeatChrome position={position} total={total} onExit={onExit} />
        <div className="min-w-0">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
