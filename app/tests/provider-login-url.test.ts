import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  providerLoginUrlHost,
  shouldOpenLoginUrlDirectly,
} from "../src/components/shell/provider-login-url.ts";

describe("providerLoginUrlHost", () => {
  it("returns the bare hostname for a normal https URL", () => {
    strictEqual(
      providerLoginUrlHost("https://claude.ai/oauth/authorize"),
      "claude.ai",
    );
  });

  it("drops the path, query, and fragment of a long OAuth URL", () => {
    const url =
      "https://auth.openai.com/authorize?client_id=abc123&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fcallback&scope=openid+profile+email&state=verylongopaquestatevalue#frag";
    strictEqual(providerLoginUrlHost(url), "auth.openai.com");
  });

  it("strips a leading www.", () => {
    strictEqual(
      providerLoginUrlHost("https://www.example.com/path"),
      "example.com",
    );
  });

  it("drops an explicit port", () => {
    strictEqual(
      providerLoginUrlHost("https://console.anthropic.com:8443/x"),
      "console.anthropic.com",
    );
  });

  it("accepts http as well as https", () => {
    strictEqual(providerLoginUrlHost("http://localhost/callback"), "localhost");
  });

  it("returns null for a non-http(s) scheme", () => {
    strictEqual(providerLoginUrlHost("file:///etc/passwd"), null);
    strictEqual(providerLoginUrlHost("javascript:alert(1)"), null);
  });

  it("returns null for an unparseable string", () => {
    strictEqual(providerLoginUrlHost("not a url"), null);
    strictEqual(providerLoginUrlHost("claude.ai/oauth"), null);
  });

  it("returns null for empty or whitespace input", () => {
    strictEqual(providerLoginUrlHost(""), null);
    strictEqual(providerLoginUrlHost("   "), null);
  });

  it("tolerates surrounding whitespace around a valid URL", () => {
    strictEqual(
      providerLoginUrlHost("  https://claude.ai/oauth  "),
      "claude.ai",
    );
  });
});

describe("shouldOpenLoginUrlDirectly", () => {
  it("opens the browser directly on desktop for a loopback flow (no device code)", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: null }),
      true,
    );
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: undefined }),
      true,
    );
  });

  it("keeps the dialog on desktop when a device code must be shown", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: "WXYZ-1234" }),
      false,
    );
  });

  it("keeps the dialog for remote / headless web clients", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: false, userCode: null }),
      false,
    );
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: false, userCode: "WXYZ-1234" }),
      false,
    );
  });

  it("treats an empty user code as no code", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: "" }),
      true,
    );
  });
});
