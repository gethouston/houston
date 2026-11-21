export type { HoustonClientOptions } from "./client/context";
export {
  HoustonEngineError,
  isHoustonEngineError,
  isSignedOutEngineError,
  SIGNED_OUT_ERROR,
} from "./client/errors";
export { isProviderLoginComplete } from "./client/provider-login-poll";

import { ActivitiesMixin } from "./client/activities-mixin";
import { AgentFilesMixin } from "./client/agent-files-mixin";
import { AgentsMixin } from "./client/agents-mixin";
import { ApiKeysMixin } from "./client/api-keys-mixin";
import { AppearanceMixin } from "./client/appearance-mixin";
import { AssistantMixin } from "./client/assistant-mixin";
import { HoustonClientBase } from "./client/base";
import { BillingMixin } from "./client/billing-mixin";
import { BootMixin } from "./client/boot-mixin";
import { BrowserLiveMixin } from "./client/browser-live-mixin";
import { ChannelsMixin } from "./client/channels-mixin";
import { ChatControlsMixin } from "./client/chat-controls-mixin";
import { ChatHistoryMixin } from "./client/chat-history-mixin";
import { ChatPrewarmMixin } from "./client/chat-prewarm-mixin";
import { ChatSendMixin } from "./client/chat-send-mixin";
import { CitationsMixin } from "./client/citations-mixin";
import { ConfigPrefsMixin } from "./client/config-prefs-mixin";
import type { HoustonClientOptions } from "./client/context";
import { CustomIntegrationsMixin } from "./client/custom-integrations-mixin";
import { DelegationMixin } from "./client/delegation-mixin";
import { FirstDayMixin } from "./client/first-day-mixin";
import { HeartbeatMixin } from "./client/heartbeat-mixin";
import { IntegrationsMixin } from "./client/integrations-mixin";
import { LinkedInMixin } from "./client/linkedin-mixin";
import { MeProfileMixin } from "./client/me-profile-mixin";
import type { BaseCtor } from "./client/mixin";
import { OrgsMixin } from "./client/orgs-mixin";
import { PlanMixin } from "./client/plan-mixin";
import { PortableMixin } from "./client/portable-mixin";
import { ProjectFileUploadsMixin } from "./client/project-file-uploads-mixin";
import { ProjectFilesMixin } from "./client/project-files-mixin";
import { ProviderCredentialsMixin } from "./client/provider-credentials-mixin";
import { ProviderLoginMixin } from "./client/provider-login-mixin";
import { ProviderStatusMixin } from "./client/provider-status-mixin";
import { PushMixin } from "./client/push-mixin";
import { RoutinesMixin } from "./client/routines-mixin";
import { SharedSkillsMixin } from "./client/shared-skills-mixin";
import { SkillsMixin } from "./client/skills-mixin";
import { SpacesMixin } from "./client/spaces-mixin";
import { TeamsMixin } from "./client/teams-mixin";
import { WorkspacesMixin } from "./client/workspaces-mixin";

export const MIXINS = [
  PortableMixin,
  ApiKeysMixin,
  TeamsMixin,
  DelegationMixin,
  BillingMixin,
  PlanMixin,
  PushMixin,
  ChannelsMixin,
  LinkedInMixin,
  HeartbeatMixin,
  SpacesMixin,
  OrgsMixin,
  MeProfileMixin,
  CustomIntegrationsMixin,
  IntegrationsMixin,
  ProviderCredentialsMixin,
  ProviderLoginMixin,
  ProviderStatusMixin,
  ChatHistoryMixin,
  ChatSendMixin,
  ChatControlsMixin,
  ChatPrewarmMixin,
  BrowserLiveMixin,
  SkillsMixin,
  RoutinesMixin,
  SharedSkillsMixin,
  ProjectFilesMixin,
  ProjectFileUploadsMixin,
  CitationsMixin,
  AgentFilesMixin,
  ActivitiesMixin,
  ConfigPrefsMixin,
  AppearanceMixin,
  AgentsMixin,
  FirstDayMixin,
  WorkspacesMixin,
  AssistantMixin,
  BootMixin,
] as const;

type UnionToIntersection<U> = (
  U extends unknown
    ? (x: U) => void
    : never
) extends (x: infer I) => void
  ? I
  : never;

type ComposedClient = UnionToIntersection<
  InstanceType<ReturnType<(typeof MIXINS)[number]>>
>;

const Composed = MIXINS.reduce<BaseCtor>(
  (Base, mixin) => mixin(Base),
  HoustonClientBase,
) as new (
  opts: HoustonClientOptions,
) => ComposedClient;

export class HoustonClient extends Composed {}
