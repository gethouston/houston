import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./manage-auth";

function headers(authorization?: string): Headers {
  const h = new Headers();
  if (authorization !== undefined) h.set("authorization", authorization);
  return h;
}

describe("extractBearerToken", () => {
  it("returns null when the header is absent", () => {
    expect(extractBearerToken(headers())).toBeNull();
  });

  it("extracts the token from a well-formed header", () => {
    expect(extractBearerToken(headers("Bearer agst_abc123"))).toBe(
      "agst_abc123",
    );
  });

  it("is case-insensitive on the scheme and tolerates extra whitespace", () => {
    expect(extractBearerToken(headers("  bearer   agst_xyz  "))).toBe(
      "agst_xyz",
    );
  });

  it("rejects a non-Bearer scheme", () => {
    expect(extractBearerToken(headers("Basic dXNlcjpwYXNz"))).toBeNull();
  });

  it("rejects a Bearer header with no token", () => {
    expect(extractBearerToken(headers("Bearer"))).toBeNull();
    expect(extractBearerToken(headers("Bearer    "))).toBeNull();
  });
});
