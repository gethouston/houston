import type { HoustonEvent } from "@houston/protocol";
import type { CapturedCustomDefinitions } from "./turn-custom-definitions-doc";

export interface OpResult {
  durableElsewhere?: boolean;
  ambiguous?: boolean;
  status: number;
  contentType: string;
  body: string;
  bodyBase64?: string;
  headers?: Record<string, string>;
  events: HoustonEvent[];
  include: (relativePath: string) => boolean;
  skillsView?: unknown;
  customDefinitions?: CapturedCustomDefinitions;
  agentMissing?: boolean;
  decline?: boolean;
  tooLarge?: true;
  privateRefused?: true;
  untouched?: true;
}
