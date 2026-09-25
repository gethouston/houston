import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  featuredProviders,
  resolveConnectAiView,
  subscriptionCardState,
} from "../src/components/onboarding/connect-ai/featured-subscriptions.ts";
import type { ProviderInfo } from "../src/lib/providers.ts";

const provider = (id: string) => ({ id, name: id }) as ProviderInfo;

describe("featuredProviders", () => {
  it("features Claude then ChatGPT whatever the incoming order", () => {
    const featured = featuredProviders([
      provider("google"),
      provider("openai"),
      provider("openrouter"),
      provider("anthropic"),
    ]);
    deepStrictEqual(
      featured.map((f) => [f.subscription, f.provider.id]),
      [
        ["claude", "anthropic"],
        ["chatgpt", "openai"],
      ],
    );
  });

  it("features only the plans this deployment offers", () => {
    const featured = featuredProviders([
      provider("openai"),
      provider("openrouter"),
    ]);
    deepStrictEqual(
      featured.map((f) => f.subscription),
      ["chatgpt"],
    );
  });

  it("features nothing when neither plan is offered", () => {
    strictEqual(featuredProviders([provider("google")]).length, 0);
  });
});

describe("resolveConnectAiView", () => {
  it("opens on the featured cards", () => {
    strictEqual(resolveConnectAiView("featured", 2), "featured");
  });

  it("shows the full list once View more asks for it", () => {
    strictEqual(resolveConnectAiView("all", 2), "all");
  });

  it("shows the full list when no featured plan is offered", () => {
    strictEqual(resolveConnectAiView("featured", 0), "all");
  });
});

describe("subscriptionCardState", () => {
  it("a confirmed connection wins over an in-flight sign-in", () => {
    strictEqual(subscriptionCardState("connected", "connecting"), "connected");
  });

  it("an in-flight sign-in reads as connecting", () => {
    strictEqual(
      subscriptionCardState("disconnected", "connecting"),
      "connecting",
    );
  });

  it("an unconfirmable probe offers no sign-in", () => {
    strictEqual(subscriptionCardState("checking", undefined), "checking");
  });

  it("a confirmed disconnect is ready to sign in", () => {
    strictEqual(subscriptionCardState("disconnected", undefined), "ready");
  });
});
