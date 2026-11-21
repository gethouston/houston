export interface SkillSummary {
  name: string;
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  category: string | null;
  featured: boolean;
  integrations: string[];
  image: string | null;
  setupActivityId?: string | null;
}

export interface SkillDetail {
  name: string;
  title: string | null;
  description: string;
  version: number;
  content: string;
  workflow?: SkillWorkflow | null;
}

export interface SkillWorkflow {
  version: 1;
  steps: SkillWorkflowStep[];
}

export interface SkillWorkflowStep {
  title: string;
  detail: string | null;
  integration: SkillStepIntegration | null;
}

export interface SkillStepIntegration {
  toolkit: string;
  action: string | null;
}

export interface SkillsManifest {
  version: 1;
  enabled: string[];
}
