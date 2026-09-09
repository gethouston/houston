import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cleanManyChatSpec,
  cleanText,
  DROPPED,
  SUMMARIES,
} from "./gen-manychat-openapi.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const committed = JSON.parse(
  readFileSync(
    join(here, "../app/src/components/integrations/manychat-openapi.json"),
    "utf8",
  ),
);

/** A raw document in ManyChat's published shape: hashed operation ids, empty
 *  summaries, HTML in descriptions, an empty server url. */
const raw = (paths) => ({
  openapi: "3.0.0",
  info: { title: "ManyChat API", version: "beta" },
  servers: [{ url: "" }],
  paths,
  components: {
    schemas: { Tag: { type: "object" } },
    securitySchemes: { Bearer: { type: "http", scheme: "bearer" } },
  },
});

const op = (tags, extra = {}) => ({
  tags,
  summary: "",
  description: "***Limit:*** 10 queries per second.<br>Lists tags.",
  operationId: "e5c671d1661acff9be0e8bcfdd59f1e8",
  responses: {},
  security: [{ Bearer: [] }],
  ...extra,
});

const sendContent = () =>
  op(["Sending"], {
    requestBody: {
      content: {
        "application/json": {
          schema: {
            properties: {
              subscriber_id: { type: "integer" },
              data: { type: "object", additionalProperties: false },
            },
          },
        },
      },
    },
  });

describe("cleanManyChatSpec", () => {
  it("renames hashed operation ids to the path's last segment and authors summaries", () => {
    const out = cleanManyChatSpec(
      raw({
        "/fb/page/getTags": { get: op(["Page"]) },
        "/fb/sending/sendContent": { post: sendContent() },
      }),
    );
    const getTags = out.paths["/fb/page/getTags"].get;
    expect(getTags.operationId).toBe("getTags");
    expect(getTags.summary).toBe(SUMMARIES["GET /fb/page/getTags"]);
    expect(getTags.description).toBe(
      `${SUMMARIES["GET /fb/page/getTags"]}. ***Limit:*** 10 queries per second. Lists tags.`,
    );
    expect(getTags.security).toEqual([{ Bearer: [] }]);
    expect(out.servers).toEqual([{ url: "https://api.manychat.com" }]);
    expect(out.components.schemas.Tag).toEqual({ type: "object" });
  });

  it("opens sendContent.data and documents the dynamic-block format", () => {
    const out = cleanManyChatSpec(
      raw({ "/fb/sending/sendContent": { post: sendContent() } }),
    );
    const data =
      out.paths["/fb/sending/sendContent"].post.requestBody.content[
        "application/json"
      ].schema.properties.data;
    expect(data.additionalProperties).toBeUndefined();
    expect(data.description).toMatch(/dynamic-block/);
  });

  it("drops the deprecated and browser-only operations", () => {
    const out = cleanManyChatSpec(
      raw({
        "/fb/page/getWidgets": { get: op(["Page"]) },
        "/fb/subscriber/verifyBySignedRequest": { post: op(["Subscriber"]) },
        "/fb/sending/sendContent": { post: sendContent() },
      }),
    );
    expect(Object.keys(out.paths)).toEqual(["/fb/sending/sendContent"]);
    expect(DROPPED.size).toBe(2);
  });

  it("refuses an operation nobody authored a summary for", () => {
    expect(() =>
      cleanManyChatSpec(
        raw({
          "/fb/page/newThing": { get: op(["Page"]) },
          "/fb/sending/sendContent": { post: sendContent() },
        }),
      ),
    ).toThrow(/no authored summary for GET \/fb\/page\/newThing/);
  });

  it("strips ManyChat's HTML from descriptions", () => {
    expect(cleanText("a<br>b<br/>c <b>bold</b>\n\n d")).toBe("a b c bold d");
  });
});

describe("the committed document", () => {
  it("is what the generator produces from its own output shape (idempotent)", () => {
    // Re-cleaning the committed document must be a no-op: every operation id
    // is already the path segment and every summary already authored.
    expect(cleanManyChatSpec(committed)).toEqual(committed);
  });

  it("covers every authored summary exactly once", () => {
    const keys = Object.entries(committed.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(new Set(keys)).toEqual(new Set(Object.keys(SUMMARIES)));
  });
});
