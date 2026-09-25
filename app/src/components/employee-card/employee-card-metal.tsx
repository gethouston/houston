import { durationMs, easing } from "@houston/design-tokens";
import { employeeMetalColors } from "@houston-ai/core";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { memo, useMemo } from "react";
import { EmployeeCardPortrait } from "./employee-card-portrait";
import { employeeMetalPattern } from "./employee-metal-pattern";

/** A single material layer crossfades; the palette trigger keeps its focus. */
export const EmployeeCardMetal = memo(function EmployeeCardMetal({
  paint,
  seed,
  dim,
}: {
  paint: string;
  /** The engraving's seed (`employeeMetalSeed`). */
  seed: number;
  dim: boolean;
}) {
  const reduce = useReducedMotion();
  const path = useMemo(() => employeeMetalPattern(seed), [seed]);
  const metal = employeeMetalColors(paint);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-2xl"
      style={{ background: metal.bottom }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={paint}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${metal.top}, ${metal.sheen} 36%, ${metal.top} 52%, ${metal.bottom})`,
          }}
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduce ? 0 : durationMs.fast / 1000,
            ease: easing.standard,
          }}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full"
            viewBox="0 0 360 160"
            preserveAspectRatio="none"
            fill="none"
          >
            <path d={path} stroke={metal.engraving} strokeWidth="0.5" />
          </svg>
          <span
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: metal.engraving }}
          />
          <EmployeeCardPortrait relief={metal.relief} dim={dim} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
