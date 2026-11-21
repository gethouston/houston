#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SPEC_URL =
  "https://api.manychat.com/swagger/compileJson?type=Page_API";
export const BASE_URL = "https://api.manychat.com";
const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../app/src/components/integrations/manychat-openapi.json",
);

export const SUMMARIES = {
  "GET /fb/page/getInfo":
    "Get the connected ManyChat account (page): name, username, timezone and plan",
  "POST /fb/page/createTag": "Create a new tag",
  "GET /fb/page/getTags": "List every tag with its id",
  "POST /fb/page/removeTag":
    "Delete a tag by id, removing it from every contact (cannot be undone)",
  "POST /fb/page/removeTagByName":
    "Delete a tag by name, removing it from every contact (cannot be undone)",
  "POST /fb/page/createCustomField":
    "Create a custom user field (text, number, date, datetime or boolean)",
  "GET /fb/page/getGrowthTools": "List growth tools (opt-in widgets)",
  "GET /fb/page/getFlows":
    "List automation flows and their folders; a flow's ns id is what sendFlow needs",
  "GET /fb/page/getCustomFields":
    "List custom user fields with their ids and types",
  "GET /fb/page/getOtnTopics": "List one-time notification (OTN) topics",
  "GET /fb/page/getBotFields":
    "List bot fields (account-wide variables) with values",
  "POST /fb/page/createBotField": "Create a bot field (account-wide variable)",
  "POST /fb/page/setBotField": "Set a bot field's value by field id",
  "POST /fb/page/setBotFieldByName": "Set a bot field's value by field name",
  "POST /fb/page/setBotFields": "Set several bot fields' values at once",
  "POST /fb/sending/sendContent":
    "Send a message (text, cards, buttons) to a contact by subscriber id",
  "POST /fb/sending/sendContentByUserRef":
    "Send a message to a contact identified by a Messenger user_ref",
  "POST /fb/sending/sendFlow":
    "Trigger an automation flow for a contact (flow_ns from getFlows)",
  "GET /fb/subscriber/getInfo":
    "Get a contact (subscriber) by id: name, email, phone, tags, custom fields, channels",
  "GET /fb/subscriber/findByName":
    "Find contacts by full name (up to 100 matches)",
  "GET /fb/subscriber/getInfoByUserRef": "Get a contact by Messenger user_ref",
  "GET /fb/subscriber/findByCustomField":
    "Find contacts whose custom field (text or number) equals a value",
  "GET /fb/subscriber/findBySystemField":
    "Find contacts by email or by phone (pass exactly one)",
  "POST /fb/subscriber/addTag": "Add a tag to a contact by tag id",
  "POST /fb/subscriber/addTagByName": "Add a tag to a contact by tag name",
  "POST /fb/subscriber/removeTag": "Remove a tag from a contact by tag id",
  "POST /fb/subscriber/removeTagByName":
    "Remove a tag from a contact by tag name",
  "POST /fb/subscriber/setCustomField":
    "Set a contact's custom field value by field id",
  "POST /fb/subscriber/setCustomFields":
    "Set several custom field values on a contact at once",
  "POST /fb/subscriber/setCustomFieldByName":
    "Set a contact's custom field value by field name",
  "POST /fb/subscriber/createSubscriber":
    "Create a contact from a phone number, WhatsApp number or email (with consent)",
  "POST /fb/subscriber/updateSubscriber":
    "Update a contact's name, phone, email, gender or messaging consent",
};

export const DROPPED = new Set([
  "GET /fb/page/getWidgets",
  "POST /fb/subscriber/verifyBySignedRequest",
]);

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"];

export function cleanText(text) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutLeadingSummary(detail, summary) {
  if (detail === summary) return "";
  const lead = `${summary}. `;
  return detail.startsWith(lead) ? detail.slice(lead.length) : detail;
}

const SEND_CONTENT_DATA_DESCRIPTION =
  'The message in ManyChat dynamic-block format: {"version":"v2","content":{"messages":[{"type":"text","text":"Hello!"}]}}. Messages may also be cards, images, files or buttons; see https://manychat.github.io/dynamic_block_docs/';

export function cleanManyChatSpec(raw) {
  const paths = {};
  for (const [path, item] of Object.entries(raw.paths)) {
    const kept = {};
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${path}`;
      if (DROPPED.has(key)) continue;
      const summary = SUMMARIES[key];
      if (!summary) throw new Error(`no authored summary for ${key}`);
      const detail = withoutLeadingSummary(
        cleanText(op.description ?? ""),
        summary,
      );
      kept[method] = {
        ...op,
        operationId: path.split("/").at(-1),
        summary,
        description: detail ? `${summary}. ${detail}` : summary,
      };
    }
    if (Object.keys(kept).length > 0) paths[path] = kept;
  }
  const data =
    paths["/fb/sending/sendContent"]?.post?.requestBody?.content?.[
      "application/json"
    ]?.schema?.properties?.data;
  if (!data) throw new Error("sendContent.data schema missing");
  delete data.additionalProperties;
  data.description = SEND_CONTENT_DATA_DESCRIPTION;
  return {
    openapi: raw.openapi,
    info: {
      title: "ManyChat API",
      description:
        "ManyChat Page API (Instagram DM, Facebook Messenger, WhatsApp, SMS and email contacts, tags, custom fields, flows and messaging). Help article: https://help.manychat.com/hc/en-us/articles/14959510331420-API-Manychat",
      version: raw.info?.version ?? "beta",
    },
    servers: [{ url: BASE_URL }],
    paths,
    components: raw.components,
  };
}

async function main() {
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`${SPEC_URL} answered ${res.status}`);
  const spec = cleanManyChatSpec(await res.json());
  writeFileSync(OUTPUT, `${JSON.stringify(spec, null, 2)}\n`);
  const count = Object.values(spec.paths).reduce(
    (n, item) => n + Object.keys(item).length,
    0,
  );
  console.log(`wrote ${OUTPUT} (${count} operations)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
