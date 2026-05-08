export type MissionId = "plan-next-workday";

export interface MissionTemplate {
  id: MissionId;
  skillName: string;
  integrations: string[];
  image: string;
}

export const TUTORIAL_MISSION: MissionTemplate = {
  id: "plan-next-workday",
  skillName: "plan-my-next-working-day",
  integrations: ["gmail", "googlecalendar"],
  image: "spiral-notepad",
};
