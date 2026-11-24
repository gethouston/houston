/** The write vocabulary — the same handlers back the facade and `dispatch`. */
export const TeamsCommand = {
  SetAssignments: "teams/setAssignments",
  GetSettings: "teams/getSettings",
  SetSettings: "teams/setSettings",
  GetModelChoice: "teams/getModelChoice",
  SetModelChoice: "teams/setModelChoice",
  TriggerStatus: "teams/triggerStatus",
} as const;

export type TeamsCommandType = (typeof TeamsCommand)[keyof typeof TeamsCommand];
