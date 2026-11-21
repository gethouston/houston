import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "./middleware";

const ORIGIN = "https://agents.gethouston.ai";

function run(method: string, path: string, headers?: Record<string, string>) {
  return middleware(new NextRequest(`${ORIGIN}${path}`, { method, headers }));
}

describe("middleware method guard", () => {
  it("refuses a Server Action probe on a page before Next decodes it", () => {
    const res = run("POST", "/", {
      "next-action": "x",
      "content-type": "multipart/form-data; boundary=x",
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it("refuses a form POST without the action header too", () => {
    const res = run("POST", "/a/some-agent", {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(res.status).toBe(405);
  });

  it("refuses writes to the API, which only serves reads", () => {
    const res = run("PUT", "/api/agents/x/ir");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("lets CORS preflight reach the API route handlers", () => {
    expect(
      run("OPTIONS", "/api/agents/x/ir").headers.get("x-middleware-next"),
    ).toBe("1");
  });

  it("treats bare /api like the rest of the API", () => {
    expect(run("POST", "/api").headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("refuses OPTIONS on a page", () => {
    expect(run("OPTIONS", "/explore").status).toBe(405);
  });

  it("passes reads through", () => {
    for (const method of ["GET", "HEAD"]) {
      const res = run(method, "/explore");
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
});

describe("middleware handle rewrite", () => {
  it("rewrites /@handle to the creator page", () => {
    const res = run("GET", "/@maria_1");
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      `${ORIGIN}/creators/maria_1`,
    );
  });

  it("rewrites the percent-encoded form", () => {
    const res = run("GET", "/%40maria_1");
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      `${ORIGIN}/creators/maria_1`,
    );
  });

  it("leaves a handle outside the gateway grammar alone", () => {
    expect(run("GET", "/@A").headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("middleware matcher", () => {
  const matches = (url: string) =>
    unstable_doesMiddlewareMatch({ config, url });

  it("runs on pages, unknown paths and the API", () => {
    for (const url of ["/", "/explore", "/a/x", "/no/such/page", "/@maria_1"]) {
      expect(matches(url)).toBe(true);
    }
    expect(matches("/api/agents/x/ir")).toBe(true);
    expect(matches("/_next/image")).toBe(true);
  });

  it("skips hashed build assets", () => {
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
  });
});
