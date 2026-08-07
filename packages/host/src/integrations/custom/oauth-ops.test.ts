import { describe, expect, it } from "vitest";
import { CustomOAuthAttempts } from "./oauth-flow";
import {
  type CustomOAuthDeps,
  completeOAuthOp,
  startOAuthOp,
} from "./oauth-ops";
import type { CustomIntegrationDef } from "./types";

/** Deps stubs: these paths fail BEFORE any store/host/network use. */
const deps = (over: Partial<CustomOAuthDeps> = {}): CustomOAuthDeps =>
  ({
    store: {} as CustomOAuthDeps["store"],
    secrets: {} as CustomOAuthDeps["secrets"],
    host: {} as CustomOAuthDeps["host"],
    attempts: new CustomOAuthAttempts(),
    onChanged: () => undefined,
    ...over,
  }) as CustomOAuthDeps;

const mcpDef = (endpoint: string): CustomIntegrationDef => ({
  kind: "mcp",
  slug: "acme",
  name: "Acme",
  endpoint,
  auth: "oauth",
  addedAtMs: 1,
});

describe("startOAuthOp", () => {
  it("refuses where no callback exists (the capability is authoritative)", async () => {
    await expect(
      startOAuthOp(deps(), mcpDef("https://mcp.example.com")),
    ).rejects.toMatchObject({ code: "oauth_unsupported" });
  });

  it("refuses a non-MCP definition", async () => {
    const def: CustomIntegrationDef = {
      kind: "openapi",
      slug: "acme",
      name: "Acme",
      spec: { kind: "url", url: "https://acme.test/openapi.json" },
      auth: "none",
      addedAtMs: 1,
    };
    await expect(
      startOAuthOp(deps({ callbackUrl: "http://127.0.0.1:1/cb" }), def),
    ).rejects.toMatchObject({ code: "oauth_unsupported" });
  });
});

describe("completeOAuthOp", () => {
  const attempt = (endpoint: string) => ({
    slug: "acme",
    endpoint,
    codeVerifier: "v",
    redirectUri: "http://127.0.0.1:1/cb",
    authorizationServerUrl: "https://auth.example.com",
    client: { client_id: "c", redirect_uris: ["http://127.0.0.1:1/cb"] },
    expiresAtMs: Date.now() + 60_000,
  });

  it("an unknown state is refused before anything else runs", async () => {
    await expect(
      completeOAuthOp(
        deps(),
        () => Promise.reject(new Error("never")),
        "nope",
        "code",
      ),
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
  });

  it("a definition whose endpoint moved mid-flow never receives the tokens", async () => {
    const attempts = new CustomOAuthAttempts();
    attempts.put("s1", attempt("https://old.example.com/mcp"));
    await expect(
      completeOAuthOp(
        deps({ attempts }),
        async () => mcpDef("https://attacker.example.net/mcp"),
        "s1",
        "code",
      ),
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
  });
});
