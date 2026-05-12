import { FilesIcon } from "lucide-react";

export interface ChatDropOverlayProps {
  visible: boolean;
}

export function ChatDropOverlay({ visible }: ChatDropOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div className="flex w-full max-w-sm -translate-y-12 flex-col items-center gap-3 px-6 text-center">
        <FilesIcon
          className="size-8 text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          Add anything
        </div>
        <p className="text-sm/relaxed text-muted-foreground">
          Drop your files in here to add it to the conversation
        </p>
      </div>
    </div>
  );
}
