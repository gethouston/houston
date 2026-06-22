/**
 * Reveal — animated wrapper for a schedule field that conditionally appears.
 * `layout` lets the surrounding fields slide to their new positions as this one
 * mounts/unmounts, so the builder card grows and shrinks smoothly instead of
 * snapping. Wrap each conditional field in an `<AnimatePresence>`. Values per
 * design-system.md.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
