import type { HeaderThresholds } from "../shell/page-header/page-header-layout";

/**
 * The strip width (its OWN width, not the window's) at which one row is honest.
 * Measured, not guessed: the widest team cluster is ~521px, the heaviest tools
 * cluster is ~474px, plus 40px horizontal padding and the 12px zone gap.
 * `521 + 474 + 40 + 12 = 1047`, rounded UP to 1060 so the boundary never
 * admits the squeeze this rule exists to prevent.
 */
export const TEAM_STRIP_ONE_ROW_MIN = 1060;

/**
 * Below this width even the widest identity lozenge (~180px) and tools
 * (~474px) cannot share the row. `180 + 474 + 40 + 12 = 706`, rounded UP to
 * 720 before tools stack beneath the strip.
 */
export const TEAM_STRIP_COMPACT_MIN = 720;

export const TEAM_STRIP_THRESHOLDS: HeaderThresholds = {
  oneRowMin: TEAM_STRIP_ONE_ROW_MIN,
  compactMin: TEAM_STRIP_COMPACT_MIN,
};
