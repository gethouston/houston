export interface SkillStepIntegration {
  toolkit: string;
  action: string | null;
}

export interface SkillWorkflowStepItem {
  title: string;
  detail: string | null;
  integration: SkillStepIntegration | null;
}
