import { Spinner } from "@houston-ai/core";
import { motion, type Transition, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import i18n from "../../lib/i18n";
import { WindowDragStrip } from "./window-drag-strip";

const ENTRANCE: Transition = { duration: 0.582, ease: [0.16, 1, 0.3, 1] };

let entrancePlayed = false;

export function WorkspaceLoading() {
  const reduce = useReducedMotion() ?? false;
  const playEntrance = !entrancePlayed;
  useEffect(() => {
    entrancePlayed = true;
  }, []);

  return (
    <div
      data-houston-boot-loading
      className="canvas-screen fixed inset-0 flex flex-col bg-background"
    >
      <WindowDragStrip />
      <div className="flex flex-1 items-center justify-center px-6">
        <motion.div
          role="status"
          className="flex flex-col items-center gap-4"
          initial={
            playEntrance
              ? reduce
                ? { opacity: 0 }
                : { opacity: 0, y: 8 }
              : false
          }
          animate={{ opacity: 1, y: 0 }}
          transition={ENTRANCE}
        >
          <Spinner
            aria-hidden="true"
            className="size-5 text-ink-muted motion-reduce:animate-none"
          />
          <p className="text-sm text-ink-muted">
            {i18n.t("shell:engineGate.starting")}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
