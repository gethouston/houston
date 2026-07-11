import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { McpAuthStore, McpOAuthState } from "./auth-store";

export class McpPendingAuthorizationError extends Error {
  constructor() {
    super("MCP authorization has not been started");
    this.name = "McpPendingAuthorizationError";
  }
}

export class StoredMcpOAuthProvider implements OAuthClientProvider {
  readonly clientMetadata: OAuthClientMetadata;

  constructor(
    private readonly id: string,
    private readonly store: McpAuthStore,
    readonly redirectUrl: string,
    private readonly onRedirect: (url: URL) => void | Promise<void>,
  ) {
    this.clientMetadata = {
      client_name: "Houston",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  private async update(patch: Partial<McpOAuthState>): Promise<void> {
    await this.store.write(this.id, {
      ...(await this.store.read(this.id)),
      ...patch,
    });
  }

  async state(): Promise<string> {
    const pending = (await this.store.read(this.id)).pending;
    if (!pending) throw new McpPendingAuthorizationError();
    return pending.state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return (await this.store.read(this.id)).clientInformation;
  }

  async saveClientInformation(
    value: OAuthClientInformationMixed,
  ): Promise<void> {
    await this.update({ clientInformation: value });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.store.read(this.id)).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.update({ tokens });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    // The host returns this URL to its caller. Opening a browser here would
    // couple a frontend-agnostic server to a desktop environment.
    await this.onRedirect(url);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.update({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const verifier = (await this.store.read(this.id)).codeVerifier;
    if (!verifier) throw new Error("MCP OAuth code verifier is missing");
    return verifier;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    const state = await this.store.read(this.id);
    if (scope === "all" || scope === "client") delete state.clientInformation;
    if (scope === "all" || scope === "tokens") delete state.tokens;
    if (scope === "all" || scope === "verifier") delete state.codeVerifier;
    await this.store.write(this.id, state);
  }
}
