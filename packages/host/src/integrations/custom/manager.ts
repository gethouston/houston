import type { AddCustomIntegrationInput } from "./add-input";
import { addCustomIntegration } from "./add-op";
import { setCustomCredential } from "./credential-op";
import { type DetectResult, detectSource } from "./detect";
import { editDetails } from "./edit-details";
import type { CustomExecutorHost } from "./executor-host";
import { CustomOAuthAttempts } from "./oauth-attempts";
import type { CustomOAuthAttempt } from "./oauth-flow";
import {
  completeOAuthOp,
  completeOAuthWithAttempt,
  prepareOAuthOp,
  startOAuthOp,
} from "./oauth-ops";
import { removeCustomIntegration } from "./remove-op";
import type { CustomSecretStore } from "./secrets";
import type { CustomIntegrationStore } from "./store";
import { toolsOf } from "./tools";
import type {
  CustomIntegrationDef,
  CustomIntegrationView,
  CustomToolInfo,
} from "./types";
import { CustomIntegrationError } from "./types";
import { viewOf } from "./views";

export type { AddCustomIntegrationInput, DetectResult };

export class CustomIntegrationManager {
  private mutations: Promise<unknown> = Promise.resolve();

  private readonly attempts = new CustomOAuthAttempts();

  constructor(
    private readonly store: CustomIntegrationStore,
    private readonly secrets: CustomSecretStore,
    private readonly host: CustomExecutorHost,
    private readonly onChanged: (changedSlug: string) => void,
    private readonly oauth: {
      callbackUrl?: string;
      statePrefix?: string;
      fetchFn?: typeof fetch;
    } = {},
  ) {}

  private oauthDeps() {
    return {
      store: this.store,
      secrets: this.secrets,
      host: this.host,
      attempts: this.attempts,
      ...this.oauth,
      onChanged: this.onChanged,
    };
  }

  get pendingOAuthAttempts(): number {
    return this.attempts.pendingCount();
  }

  get oauthSupported(): boolean {
    return this.oauth.callbackUrl !== undefined;
  }

  async prepareOAuth(slug: string) {
    return prepareOAuthOp(this.oauthDeps(), await this.defOr404(slug));
  }

  completeOAuthWith(
    attempt: CustomOAuthAttempt,
    code: string,
  ): Promise<CustomIntegrationView> {
    return this.serialize(() =>
      completeOAuthWithAttempt(
        this.oauthDeps(),
        (slug) => this.defOr404(slug),
        attempt,
        code,
      ),
    );
  }

  async startOAuth(slug: string): Promise<{ authorizeUrl: string }> {
    return startOAuthOp(this.oauthDeps(), await this.defOr404(slug));
  }

  completeOAuth(state: string, code: string): Promise<CustomIntegrationView> {
    return this.serialize(() =>
      completeOAuthOp(
        this.oauthDeps(),
        (slug) => this.defOr404(slug),
        state,
        code,
      ),
    );
  }

  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const run = this.mutations.then(op, op);
    this.mutations = run.catch(() => undefined);
    return run;
  }

  async list(): Promise<CustomIntegrationView[]> {
    const [defs, { executor, states }] = await Promise.all([
      this.store.list(),
      this.host.ensure(),
    ]);
    return Promise.all(
      defs.map(async (def) =>
        viewOf(
          def,
          states.get(def.slug) ?? { status: "error", message: "not compiled" },
          await this.host.authMethods(executor, def.slug).catch(() => []),
        ),
      ),
    );
  }

  async detect(url: string): Promise<DetectResult> {
    const { executor } = await this.host.ensure();
    const result = await detectSource(executor, url);
    return result.requiresOAuth
      ? { ...result, oauthSupported: this.oauthSupported }
      : result;
  }

  async tools(slug: string): Promise<CustomToolInfo[]> {
    await this.defOr404(slug);
    const { executor } = await this.host.ensure();
    return toolsOf(executor, slug);
  }

  add(input: AddCustomIntegrationInput): Promise<CustomIntegrationView> {
    return this.serialize(() => addCustomIntegration(this.oauthDeps(), input));
  }

  updateDetails(slug: string, input: unknown): Promise<void> {
    return this.serialize(async () => {
      const def = editDetails(await this.defOr404(slug), input);
      await this.store.put(def);
      this.onChanged(slug);
    });
  }

  setCredential(
    slug: string,
    values: Record<string, string>,
  ): Promise<CustomIntegrationView> {
    return this.serialize(async () =>
      setCustomCredential(this.oauthDeps(), await this.defOr404(slug), values),
    );
  }

  remove(slug: string): Promise<void> {
    return this.serialize(async () =>
      removeCustomIntegration(this.oauthDeps(), await this.defOr404(slug)),
    );
  }

  private async defOr404(slug: string): Promise<CustomIntegrationDef> {
    const def = (await this.store.list()).find((d) => d.slug === slug);
    if (!def) {
      throw new CustomIntegrationError(
        "not_found",
        `no custom integration '${slug}'`,
      );
    }
    return def;
  }
}
