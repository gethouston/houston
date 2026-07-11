import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deserializeSession,
  type Session,
  serializeSession,
  sessionExpiresWithin,
} from "../src/lib/identity/session.ts";

const session: Session = {
  idToken: "id-token-abc",
  refreshToken: "refresh-token-xyz",
  uid: "firebase-uid-1",
  email: "user@example.com",
  emailVerified: true,
  displayName: "Ada Lovelace",
  photoUrl: "https://example.com/avatar.png",
  provider: "google.com",
  expiresAt: 1_800_000_000_000,
};

describe("identity/session (de)serialization", () => {
  it("round-trips a full session", () => {
    const back = deserializeSession(serializeSession(session));
    deepStrictEqual(back, session);
  });

  it("serialize is canonical — drops unknown extra fields", () => {
    const dirty = { ...session, injected: "nope" } as Session & {
      injected: string;
    };
    const json = serializeSession(dirty);
    strictEqual(json.includes("injected"), false);
  });

  it("accepts a null displayName", () => {
    const anon: Session = { ...session, displayName: null };
    deepStrictEqual(deserializeSession(serializeSession(anon)), anon);
  });

  it("round-trips photoUrl (a URL and a null)", () => {
    deepStrictEqual(deserializeSession(serializeSession(session)), session);
    const noPhoto: Session = { ...session, photoUrl: null };
    deepStrictEqual(deserializeSession(serializeSession(noPhoto)), noPhoto);
  });

  it("survives a valid blob carrying a photoUrl string", () => {
    const raw = JSON.stringify({
      ...session,
      photoUrl: "https://cdn.example.com/pic.jpg",
    });
    const back = deserializeSession(raw);
    strictEqual(back?.photoUrl, "https://cdn.example.com/pic.jpg");
  });

  it("discards a blob whose photoUrl is the wrong type", () => {
    strictEqual(
      deserializeSession(JSON.stringify({ ...session, photoUrl: 123 })),
      null,
    );
  });

  it("returns null for absent input (never throws)", () => {
    strictEqual(deserializeSession(null), null);
    strictEqual(deserializeSession(undefined), null);
    strictEqual(deserializeSession(""), null);
  });

  it("returns null for unparseable JSON", () => {
    strictEqual(deserializeSession("{not json"), null);
  });

  it("discards a legacy Supabase blob (unknown shape) as signed-out", () => {
    // Shape a real supabase-js persisted session roughly resembles.
    const legacy = JSON.stringify({
      access_token: "sb-access",
      refresh_token: "sb-refresh",
      expires_at: 1700000000,
      token_type: "bearer",
      user: { id: "sb-uuid", email: "u@e.com" },
    });
    strictEqual(deserializeSession(legacy), null);
  });

  it("rejects a blob missing required fields or with wrong types", () => {
    strictEqual(
      deserializeSession(JSON.stringify({ ...session, idToken: "" })),
      null,
    );
    strictEqual(
      deserializeSession(JSON.stringify({ ...session, expiresAt: "soon" })),
      null,
    );
    strictEqual(
      deserializeSession(JSON.stringify({ ...session, provider: "apple.com" })),
      null,
    );
    strictEqual(
      deserializeSession(JSON.stringify({ ...session, emailVerified: "yes" })),
      null,
    );
  });
});

describe("identity/session sessionExpiresWithin", () => {
  it("is true within the skew window and false comfortably before", () => {
    const soon: Session = { ...session, expiresAt: Date.now() + 60_000 };
    strictEqual(sessionExpiresWithin(soon, 5 * 60_000), true);
    const far: Session = { ...session, expiresAt: Date.now() + 60 * 60_000 };
    strictEqual(sessionExpiresWithin(far, 5 * 60_000), false);
  });
});
