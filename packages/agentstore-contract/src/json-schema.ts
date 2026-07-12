/**
 * AgentIR 2.0.0 as a public JSON Schema (Draft 2020-12).
 *
 * This is the STABLE, machine-readable contract any AI agent fetches at
 * GET /v1/agentstore/schema/agent to learn how to build an AgentIR and POST it
 * to /v1/agentstore/agents. It is HAND-MAINTAINED (NOT a runtime zod->json-schema
 * conversion) so the wire contract never shifts under a zod-internals upgrade.
 *
 * DRIFT WARNING: if you change `ir.ts` (the zod schema-of-record) you MUST update
 * this file in the SAME change. `json-schema.test.ts` fails on the common drifts
 * (a renamed/dropped top-level or identity key, a changed required set, a version
 * bump) so the two stay in lockstep.
 *
 * required-ness note: zod `.default([])` makes tags/skills/learnings/integrations
 * OPTIONAL on input, so they are NOT in the JSON Schema `required` arrays —
 * matching exactly what the ingest endpoint accepts.
 */
import { AGENT_IR_VERSION } from "./ir";

const SLUG_PATTERN = "^[a-z0-9][a-z0-9-]{0,63}$";
const INTEGRATION_PATTERN = "^[A-Z0-9_]{1,64}$";
// Mirrors `httpsUrl` in ir.ts (z.url({ protocol: /^https$/ })): zod rejects
// http/ftp/etc, so the published schema must advertise https-only too or an
// agent building strictly against it gets a surprise 422 at ingest.
const HTTPS_URL_PATTERN = "^https://";

const emojiIcon = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "value"],
  properties: {
    kind: { const: "emoji" },
    value: { type: "string", minLength: 1, maxLength: 80 },
  },
} as const;

const urlIcon = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "url"],
  properties: {
    kind: { const: "url" },
    url: {
      type: "string",
      format: "uri",
      pattern: HTTPS_URL_PATTERN,
      maxLength: 2048,
    },
  },
} as const;

export const agentIrJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://gateway.gethouston.ai/v1/agentstore/schema/agent",
  title: "AgentIR",
  description:
    "Houston Agent Store's framework-agnostic agent representation (v2.0.0). " +
    "Build one from your agent's CLAUDE.md, its SKILL.md files, learnings and " +
    "integrations, then POST it to /v1/agentstore/agents to publish (you get back " +
    "a claimCode and a claimUrl to claim it).",
  type: "object",
  additionalProperties: false,
  required: ["irVersion", "identity", "instructions", "provenance"],
  properties: {
    irVersion: { const: AGENT_IR_VERSION },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["slug", "name", "description", "category", "creator"],
      properties: {
        slug: {
          type: "string",
          pattern: SLUG_PATTERN,
          description: "kebab-case, starts alphanumeric, 1..64 chars.",
        },
        name: { type: "string", minLength: 1, maxLength: 120 },
        tagline: { type: "string", maxLength: 160 },
        description: {
          type: "string",
          minLength: 1,
          maxLength: 20000,
          description: 'Markdown "what it does".',
        },
        icon: {
          description: "An emoji OR an https image URL.",
          oneOf: [emojiIcon, urlIcon],
        },
        color: { type: "string", maxLength: 32 },
        category: { type: "string", pattern: SLUG_PATTERN },
        tags: {
          type: "array",
          maxItems: 6,
          items: { type: "string", pattern: SLUG_PATTERN },
          description: "Up to 6 lowercase slug tags.",
        },
        creator: {
          type: "object",
          additionalProperties: false,
          required: ["displayName"],
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 80 },
            url: {
              type: "string",
              format: "uri",
              pattern: HTTPS_URL_PATTERN,
              maxLength: 2048,
            },
          },
          description:
            "MAY be sent with only a placeholder — it is rewritten to you when you " +
            "claim the upload.",
        },
      },
    },
    instructions: {
      type: "string",
      maxLength: 200000,
      description: "The agent's CLAUDE.md. May be an empty string.",
    },
    skills: {
      type: "array",
      maxItems: 64,
      description:
        "Discrete skills; each `body` is a full SKILL.md file. Omit or send [].",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "body"],
        properties: {
          slug: { type: "string", pattern: SLUG_PATTERN },
          body: {
            type: "string",
            minLength: 1,
            maxLength: 200000,
            description:
              "The full SKILL.md text (YAML frontmatter + markdown), verbatim.",
          },
        },
      },
    },
    learnings: {
      type: "array",
      maxItems: 500,
      description: "Captured learnings. Omit or send [].",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 64 },
          text: { type: "string", minLength: 1, maxLength: 4000 },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    integrations: {
      type: "array",
      maxItems: 64,
      description: "Composio toolkit slugs the agent expects. Omit or send [].",
      items: { type: "string", pattern: INTEGRATION_PATTERN },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["createdVia"],
      properties: {
        createdVia: { enum: ["houston", "agent-post"] },
        exporter: { type: "string", maxLength: 80 },
        houstonVersion: { type: "string", maxLength: 40 },
        anonymized: { type: "boolean" },
      },
    },
  },
} as const;
