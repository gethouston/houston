export type RoleQuestionAnswer<Id extends string> =
  | { kind: "catalog"; id: Id }
  | { kind: "custom"; label: string };

export type RoleQuestionAudience = "agent" | "self";
