import { durationMs, easing } from "@houston/design-tokens";
import { cn } from "@houston-ai/core";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCardCarousel } from "./use-card-carousel";

/** The gap between two cards arriving. */
const STAGGER_S = 0.08;
/** Past the fifth card the rest arrive together, so a long roster never
 *  keeps the person waiting on its last row. */
const STAGGER_CAP = 5;

/**
 * A team of employee cards. On a desktop, three across, more wrapping into
 * rows of three. On a phone, a snap carousel of 288px slides where the next
 * card peeks in from the edge, with a dot per card to jump to it: stacked,
 * three badges are a long scroll, and each slide opens its own palette so
 * which card a swatch colors is never in doubt.
 *
 * The cards arrive left to right like new hires walking in: the welcome is a
 * designated moment, so each rises over `duration.elegant` on the entrance
 * curve. With reduced motion they only fade.
 *
 * The carousel bleeds 20px past its column on a phone, to the frame's edge,
 * so a slide scrolls out of view rather than being clipped mid-card.
 */
export function EmployeeCardDeck({
  items,
}: {
  items: readonly { key: string; card: ReactNode }[];
}) {
  const { t } = useTranslation("shell");
  const reduce = useReducedMotion() ?? false;
  const carousel = useCardCarousel(items.length);

  return (
    <div className="flex flex-col gap-3">
      <ul
        ref={carousel.list}
        onScroll={carousel.onScroll}
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pt-1 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))] md:gap-4 md:overflow-visible md:px-0"
      >
        {items.map((item, index) => (
          <motion.li
            key={item.key}
            className="flex shrink-0 snap-start justify-center md:block"
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
      {items.length > 1 && (
        <div className="flex justify-center md:hidden">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => carousel.show(index)}
              aria-label={t("employeeCard.showCard", {
                current: index + 1,
                total: items.length,
              })}
              aria-current={index === carousel.index || undefined}
              className="flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full bg-ink transition-opacity duration-200",
                  index === carousel.index ? "opacity-100" : "opacity-20",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
