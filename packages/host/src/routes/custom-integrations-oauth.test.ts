import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { CustomIntegrationError } from "../integrations/custom/types";
import { handleCustomOAuthCallback } from "./custom-integrations-oauth";

function fakeRes() {
  const chunks: string[] = [];
  let status = 0;
  const res = {
    writeHead: (code: number) => {
      status = code;
      return res;
    },
    end: (body?: string) => {
      if (body) chunks.push(body);
    },
  } as unknown as ServerResponse;
  return { res, body: () => chunks.join(""), status: () => status };
}

const urlOf = (query: string) =>
  new URL(`http://host.local/v1/integrations/custom/oauth/callback${query}`);

describe("handleCustomOAuthCallback", () => {
  it("completes the flow and serves the success page", async () => {
    const completeOAuth = vi.fn(async () => ({}) as never);
    const { res, body, status } = fakeRes();
    const handled = await handleCustomOAuthCallback(
      {
        customIntegrations: {
          completeOAuth,
        } as unknown as CustomIntegrationManager,
      },
      "GET",
      "/v1/integrations/custom/oauth/callback",
      urlOf("?code=c1&state=s1"),
      res,
    );
    expect(handled).toBe(true);
    expect(completeOAuth).toHaveBeenCalledWith("s1", "c1");
    expect(status()).toBe(200);
    expect(body()).toContain("return to Houston");
  });

  it("a denied consent screen never reaches the manager", async () => {
    const completeOAuth = vi.fn();
    const { res, body, status } = fakeRes();
    await handleCustomOAuthCallback(
      {
        customIntegrations: {
          completeOAuth,
        } as unknown as CustomIntegrationManager,
      },
      "GET",
      "/v1/integrations/custom/oauth/callback",
      urlOf("?error=access_denied&state=s1"),
      res,
    );
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(status()).toBe(400);
    expect(body()).toContain("declined");
  });

  it("a stale state renders the failure page with the reason, escaped", async () => {
    const completeOAuth = vi.fn(async () => {
      throw new CustomIntegrationError(
        "oauth_state_invalid",
        "this sign-in link has expired <script>",
      );
    });
    const { res, body, status } = fakeRes();
    await handleCustomOAuthCallback(
      {
        customIntegrations: {
          completeOAuth,
        } as unknown as CustomIntegrationManager,
      },
      "GET",
      "/v1/integrations/custom/oauth/callback",
      urlOf("?code=c&state=stale"),
      res,
    );
    expect(status()).toBe(400);
    expect(body()).toContain("expired");
    expect(body()).not.toContain("<script>");
  });

  it("other paths fall through", async () => {
    const { res } = fakeRes();
    const handled = await handleCustomOAuthCallback(
      { customIntegrations: undefined },
      "GET",
      "/v1/integrations/custom/definitions",
      urlOf(""),
      res,
    );
    expect(handled).toBe(false);
  });
});
