export type MissionId = "plan-next-workday";

/**
 * The onboarding flow is no longer mission-driven (the old Try/Skill/Routine
 * missions are gone). All that survives is the analytics id stamped on the
 * `onboarding_completed` event, so this is a single-field constant.
 */
export const TUTORIAL_MISSION: { id: MissionId } = { id: "plan-next-workday" };
