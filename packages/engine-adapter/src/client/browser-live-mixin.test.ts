import { describe, expect, test, vi } from "vitest";
import type { HoustonClientBase } from "./base";
import { BrowserLiveMixin } from "./browser-live-mixin";

function client(cp: object | null) {
  const connection = {
    send: vi.fn(),
    finish: vi.fn(),
    setLayout: vi.fn(),
    retry: vi.fn(),
    close: vi.fn(),
  };
  const connect = vi.fn(() => connection);
  class Base {
    ctx = { cp, sdk: { browser: { connect } } };
  }
  const live = new (BrowserLiveMixin(
    Base as unknown as new () => HoustonClientBase,
  ))();
  return { live, connect, connection };
}

const handlers = {
  onFrame: vi.fn(),
  onPage: vi.fn(),
  onStatus: vi.fn(),
  onConnection: vi.fn(),
  onRefused: vi.fn(),
  onUnexpected: vi.fn(),
};

describe("openBrowserLive", () => {
  test("scopes the connection to the agent on a hosted profile", () => {
    const { live, connect, connection } = client({});
    expect(
      live.openBrowserLive("agent-a", "c1", handlers, { layout: "phone" }),
    ).toBe(connection);
    expect(connect).toHaveBeenCalledWith("c1", "agent-a", handlers, {
      layout: "phone",
    });
  });

  test("roots at the single local runtime without a control plane", () => {
    const { live, connect } = client(null);
    live.openBrowserLive("agent-a", "c1", handlers);
    expect(connect).toHaveBeenCalledWith("c1", "", handlers, undefined);
  });
});
