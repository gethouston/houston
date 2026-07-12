import { afterEach, describe, expect, it } from "vitest";
import {
  clientGatewayBase,
  StoreApiError,
  serverGatewayBase,
  toDisplayIcon,
  toStoreApiError,
} from "./store-api-types";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("gateway base URLs", () => {
  afterEach(() => {
    delete process.env.AGENTSTORE_GATEWAY_URL;
    delete process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL;
  });

  it("falls back to the default gateway when unset", () => {
    expect(serverGatewayBase()).toBe("https://gateway.gethouston.ai");
    expect(clientGatewayBase()).toBe("https://gateway.gethouston.ai");
  });

  it("trims trailing slashes from the configured base", () => {
    process.env.AGENTSTORE_GATEWAY_URL = "https://gw.example.com/";
    process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL =
      "https://gw.example.com///";
    expect(serverGatewayBase()).toBe("https://gw.example.com");
    expect(clientGatewayBase()).toBe("https://gw.example.com");
  });

  it("treats a blank env value as unset", () => {
    process.env.AGENTSTORE_GATEWAY_URL = "   ";
    expect(serverGatewayBase()).toBe("https://gateway.gethouston.ai");
  });
});

describe("toStoreApiError", () => {
  it("derives the machine code from the gateway's error token", async () => {
    // The Go gateway carries the machine token in `error` only (no `code`
    // field): edge.WriteError writes `{"error": token}`. The token must reach
    // callers as `code` so they can branch on it.
    const err = await toStoreApiError(
      jsonResponse({ error: "not_owner" }, 403),
    );
    expect(err).toBeInstanceOf(StoreApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("not_owner");
    expect(err.code).toBe("not_owner");
  });

  it("prefers an explicit code over the error token when present", async () => {
    const err = await toStoreApiError(
      jsonResponse({ error: "human readable", code: "machine_code" }, 400),
    );
    expect(err.message).toBe("human readable");
    expect(err.code).toBe("machine_code");
  });

  it("keeps a status-based message when the body has no error field", async () => {
    const err = await toStoreApiError(jsonResponse({ other: 1 }, 500));
    expect(err.message).toContain("500");
    expect(err.code).toBeUndefined();
  });

  it("survives a non-JSON body", async () => {
    const err = await toStoreApiError(
      new Response("<html>502</html>", { status: 502 }),
    );
    expect(err.status).toBe(502);
    expect(err.message).toContain("502");
  });
});

describe("toDisplayIcon", () => {
  it("returns undefined for a null icon", () => {
    expect(toDisplayIcon(null)).toBeUndefined();
  });

  it("maps an emoji icon to the emoji union", () => {
    expect(toDisplayIcon({ kind: "emoji", value: "🚀" })).toEqual({
      kind: "emoji",
      value: "🚀",
    });
  });

  it("maps a url icon's value onto the url field", () => {
    expect(toDisplayIcon({ kind: "url", value: "https://x/i.png" })).toEqual({
      kind: "url",
      url: "https://x/i.png",
    });
  });
});
