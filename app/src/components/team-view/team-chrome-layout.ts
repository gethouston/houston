import type { HeaderThresholds } from "../shell/page-header/page-header-layout";

/**
 * The strip width (its OWN width, not the window's) at which one row is honest.
 * Measured, not guessed: the widest team cluster is ~521px, the heaviest tools
 * cluster is ~474px, plus 40px horizontal padding and the 12px zone gap.
 * `521 + 474 + 40 + 12 = 1047`, rounded UP to 1060 so the boundary never
 * admits the squeeze this rule exists to prevent. Below it the TOOLS take the
 * body row; the lozenge cluster keeps the strip.
 */
export const TEAM_STRIP_ONE_ROW_MIN = 1060;

export const TEAM_STRIP_THRESHOLDS: HeaderThresholds = {
  oneRowMin: TEAM_STRIP_ONE_ROW_MIN,
};
