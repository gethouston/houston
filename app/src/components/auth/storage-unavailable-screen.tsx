import { Button } from "@houston-ai/core";
import i18n from "../../lib/i18n";
import { WindowDragStrip } from "../shell/window-drag-strip";

export function StorageUnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="relative flex h-dvh items-center justify-center bg-gutter px-6 text-ink">
      <WindowDragStrip />
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-lg font-medium">
          {i18n.t("errors:auth.storageUnavailableTitle")}
        </h1>
        <p className="text-sm text-ink-muted">
          {i18n.t("errors:auth.storageUnavailableBody")}
        </p>
        <Button className="mt-2" onClick={onRetry}>
          {i18n.t("errors:auth.storageUnavailableRetry")}
        </Button>
      </div>
    </div>
  );
}
