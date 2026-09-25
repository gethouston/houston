import { durationMs, easing } from "@houston/design-tokens";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** Only paint crossfades; the controls and their focus stay mounted. */
export function EmployeeCardPaint({ paint }: { paint: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={paint}
          className="absolute inset-0"
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduce ? 0 : durationMs.fast / 1000,
            ease: easing.standard,
          }}
        >
          <div
            className="absolute inset-0 opacity-5"
            style={{ backgroundColor: paint }}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
