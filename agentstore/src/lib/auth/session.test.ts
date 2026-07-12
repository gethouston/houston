import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Mock the firebase SDK + the local firebase bootstrap so the session module is
// importable without the `firebase` package installed. `hoisted` lets the mock
// factories read a mutable "configured" flag the tests flip.
const state = vi.hoisted(() => ({ configured: false }));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  onIdTokenChanged: () => () => {},
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("./firebase", () => ({
  isAuthConfigured: () => state.configured,
  firebaseConfig: () =>
    state.configured ? { apiKey: "k", authDomain: "d", projectId: "p" } : null,
  getFirebaseAuth: () => ({}),
}));

import { SessionProvider, useSession } from "./session";

/** A consumer that renders the current session status. */
function StatusProbe() {
  const { status } = useSession();
  return createElement("span", null, status);
}

describe("useSession", () => {
  it("throws when used outside a SessionProvider", () => {
    expect(() => renderToStaticMarkup(createElement(StatusProbe))).toThrow(
      /SessionProvider/,
    );
  });

  it("reports 'unconfigured' when auth is not configured", () => {
    state.configured = false;
    const html = renderToStaticMarkup(
      createElement(SessionProvider, null, createElement(StatusProbe)),
    );
    expect(html).toContain("unconfigured");
  });

  it("starts in 'loading' when auth is configured", () => {
    state.configured = true;
    const html = renderToStaticMarkup(
      createElement(SessionProvider, null, createElement(StatusProbe)),
    );
    expect(html).toContain("loading");
    state.configured = false;
  });
});
