import { durationMs, easing } from "@houston/design-tokens";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const STAGGER_S = 0.08;
const STAGGER_CAP = 5;

export function EmployeeCardDeck({
  items,
}: {
  items: readonly { key: string; card: ReactNode }[];
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-3 @5xl:grid-cols-3 @5xl:gap-4">
        {items.map((item, index) => (
          <motion.li
            key={item.key}
            className="flex min-w-0"
            initial={{
              opacity: 0,
              y: reduce ? 0 : 12,
              scale: reduce ? 1 : 0.98,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: durationMs.elegant / 1000,
              ease: easing.entrance,
              delay: Math.min(index, STAGGER_CAP) * STAGGER_S,
            }}
          >
            {item.card}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function focusEmployeeName(
  root: HTMLElement | null,
  index: number,
  reduce: boolean,
): void {
  const field = root?.querySelectorAll<HTMLInputElement>(
    "[data-employee-name]",
  )[index];
  if (!field) return;
  (field.closest("fieldset") ?? field).scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "nearest",
  });
  field.focus({ preventScroll: true });
}
