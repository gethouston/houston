import { afterEach, describe, expect, it } from "vitest";
import {
  clientGatewayBase,
  serverGatewayBase,
  toDisplayIcon,
} from "./store-api-types";

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
