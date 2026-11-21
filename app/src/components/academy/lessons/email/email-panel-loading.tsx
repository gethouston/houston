import { Loader2 } from "lucide-react";

export function EmailPanelLoading({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2" role="status">
      <Loader2 className="size-5 animate-spin text-ink-muted" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
