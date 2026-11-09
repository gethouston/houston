import { useState } from "react";
import { useUIStore } from "../../stores/ui";
import type { HintKind } from "./preview-float-bars";

/**
 * The hint over the pages. With a chat, how to comment (a drag, or a long
 * press on touch): shown until the person dismisses it or makes their first
 * selection, once per device. Without one, that commenting needs a chat:
 * shown each opening until dismissed, since it explains why nothing happens.
 */
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
