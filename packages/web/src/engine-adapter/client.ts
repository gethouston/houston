/**
 * Drop-in replacement for `@houston-ai/engine-client`'s HoustonClient, backed by
 * the new TS engine. Boot/chat/auth map to the new engine; a single synthetic
 * workspace holds localStorage-backed agents, their `.houston/**` files, and
 * their boards.
 *
 * The ~100 methods are split into cohesive cluster **mixins** (under `client/`),
 * composed here over ONE shared {@link HoustonClientBase} → {@link AdapterContext}
 * (`client/context.ts`) so `cp`/`engine`/`sdk` and the active-org state have a
 * single source of truth. The public method surface (names + signatures) is
 * unchanged, so every caller is untouched.
 *
 * There is deliberately NO catch-all Proxy: the old adapter masked unknown
 * methods with `async () => []`, a silent-failure hazard. Legacy desktop/Rust
 * methods that don't exist on the host engine now throw explicitly
 * ({@link LegacyUnsupportedMixin}); a genuinely undefined method throws a real
 * TypeError instead of resolving to `[]`.
 */
export type { HoustonClientOptions } from "./client/context";
export { HoustonEngineError, isHoustonEngineError } from "./client/errors";

import { ActivitiesMixin } from "./client/activities-mixin";
import { AgentFilesMixin } from "./client/agent-files-mixin";
import { AgentsMixin } from "./client/agents-mixin";
import { ApiKeysMixin } from "./client/api-keys-mixin";
import { HoustonClientBase } from "./client/base";
import { BootMixin } from "./client/boot-mixin";
import { ChatHistoryMixin } from "./client/chat-history-mixin";
import { ChatSendMixin } from "./client/chat-send-mixin";
import { ConfigPrefsMixin } from "./client/config-prefs-mixin";
import { IntegrationsMixin } from "./client/integrations-mixin";
import { LegacyUnsupportedMixin } from "./client/legacy-unsupported-mixin";
import { MarketplaceMixin } from "./client/marketplace-mixin";
import { OrgsMixin } from "./client/orgs-mixin";
import { PortableMixin } from "./client/portable-mixin";
import { ProjectFilesMixin } from "./client/project-files-mixin";
import { ProviderCredentialsMixin } from "./client/provider-credentials-mixin";
import { ProviderLoginMixin } from "./client/provider-login-mixin";
import { ProviderStatusMixin } from "./client/provider-status-mixin";
import { RoutinesSkillsMixin } from "./client/routines-skills-mixin";
import { TeamsMixin } from "./client/teams-mixin";
import { WorkspacesMixin } from "./client/workspaces-mixin";

/**
 * The composed client. Mixin order is irrelevant — the clusters are
 * method-disjoint and all state lives on the shared `ctx`, not on any mixin.
 */
const Composed = BootMixin(
  WorkspacesMixin(
    AgentsMixin(
      ConfigPrefsMixin(
        ActivitiesMixin(
          AgentFilesMixin(
            ProjectFilesMixin(
              RoutinesSkillsMixin(
                MarketplaceMixin(
                  ChatSendMixin(
                    ChatHistoryMixin(
                      ProviderStatusMixin(
                        ProviderLoginMixin(
                          ProviderCredentialsMixin(
                            IntegrationsMixin(
                              OrgsMixin(
                                TeamsMixin(
                                  ApiKeysMixin(
                                    PortableMixin(
                                      LegacyUnsupportedMixin(HoustonClientBase),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);

export class HoustonClient extends Composed {}
