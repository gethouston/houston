export type MissionId = "plan-next-workday";

export interface MissionTemplate {
  id: MissionId;
  skillName: string;
  image: string;
}

export const TUTORIAL_MISSION: MissionTemplate = {
  id: "plan-next-workday",
  skillName: "plan-my-next-working-day",
  image: "spiral-notepad",
};
