import { useState } from "react";
import { useUIStore } from "../../stores/ui";
import type { HintKind } from "./preview-float-bars";

export function useCommentHint(selectable: boolean, touch: boolean) {
  const seen = useUIStore((s) => s.previewHintSeen);
  const markSeen = useUIStore((s) => s.markPreviewHintSeen);
  const [noChatSeen, setNoChatSeen] = useState(false);
  const kind: HintKind | null = selectable
    ? seen
      ? null
      : touch
        ? "touch"
        : "pointer"
    : noChatSeen
      ? null
      : "noChat";
  return {
    kind,
    done: () => {
      if (!selectable) setNoChatSeen(true);
      else if (!seen) markSeen();
    },
  };
}
