/**
 * The HoustonClient every frontend talks to, backed by the TS engine.
 * Boot/chat/auth map to the engine; a single synthetic workspace holds
 * localStorage-backed agents, their `.houston/**` files, and their boards.
 *
 * The ~100 methods are split into cohesive cluster **mixins** (under `client/`),
 * composed here over ONE shared {@link HoustonClientBase} → {@link AdapterContext}
 * (`client/context.ts`) so `cp`/`engine`/`sdk` and the active-org state have a
 * single source of truth. The public method surface (names + signatures) is
 * unchanged, so every caller is untouched.
 *
 * There is deliberately NO catch-all Proxy: the old adapter masked unknown
 * methods with `async () => []`, a silent-failure hazard. A method this client
 * does not define is `undefined`, so a stray call is a real TypeError the
 * caller can see and report instead of a silent `[]`.
 */
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
import { ChannelsMixin } from "./client/channels-mixin";
import { ChatControlsMixin } from "./client/chat-controls-mixin";
import { ChatHistoryMixin } from "./client/chat-history-mixin";
import { ChatSendMixin } from "./client/chat-send-mixin";
import { ConfigPrefsMixin } from "./client/config-prefs-mixin";
import type { HoustonClientOptions } from "./client/context";
import { CustomIntegrationsMixin } from "./client/custom-integrations-mixin";
import { FirstDayMixin } from "./client/first-day-mixin";
import { IntegrationsMixin } from "./client/integrations-mixin";
import { MeProfileMixin } from "./client/me-profile-mixin";
import type { BaseCtor } from "./client/mixin";
import { OrgTeamsMixin } from "./client/org-teams-mixin";
import { OrgsMixin } from "./client/orgs-mixin";
import { PortableMixin } from "./client/portable-mixin";
import { ProjectFilesMixin } from "./client/project-files-mixin";
import { ProviderCredentialsMixin } from "./client/provider-credentials-mixin";
import { ProviderLoginMixin } from "./client/provider-login-mixin";
import { ProviderStatusMixin } from "./client/provider-status-mixin";
import { RoutinesMixin } from "./client/routines-mixin";
import { SharedSkillsMixin } from "./client/shared-skills-mixin";
import { SkillsMixin } from "./client/skills-mixin";
import { SpacesMixin } from "./client/spaces-mixin";
import { TeamsMixin } from "./client/teams-mixin";
import { WorkspacesMixin } from "./client/workspaces-mixin";

/**
 * Every cluster mixin, innermost first. The clusters are method-disjoint and
 * all state lives on the shared `ctx`, never on a mixin, so this is an
 * unordered SET that happens to be written as a list — adding one is a line
 * here and nothing else. Exported for `client-mixin-composition.test.ts`,
 * which pins the properties this relies on: no two mixins declare the same
 * method name (what makes the order irrelevant), every mixin module under
 * `client/` is listed, and the fold exposes each one's methods.
 */
export const MIXINS = [
  PortableMixin,
  ApiKeysMixin,
  TeamsMixin,
  OrgTeamsMixin,
  BillingMixin,
  ChannelsMixin,
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
  SkillsMixin,
  RoutinesMixin,
  SharedSkillsMixin,
  ProjectFilesMixin,
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

/** The classic union→intersection fold. */
type UnionToIntersection<U> = (
  U extends unknown
    ? (x: U) => void
    : never
) extends (x: infer I) => void
  ? I
  : never;

/**
 * The composed client's instance type: every mixin's own methods, intersected.
 *
 * `reduce` cannot carry a type through a heterogeneous chain — its accumulator
 * would collapse to {@link HoustonClientBase} and the ~200 public methods would
 * vanish from the compiler's view — so the surface is stated here instead, from
 * the same {@link MIXINS} array the runtime folds. Each element's return type
 * is that one cluster over the base, and intersecting them is exact BECAUSE the
 * clusters are method-disjoint (the test that pins it is what keeps this sound).
 */
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
