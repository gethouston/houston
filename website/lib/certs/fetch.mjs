// Build-time loader for bootcamp certificates.
//
// Pulls the published events + issued certificate codes from the Houston Cloud
// gateway export endpoint and shapes them into the single structure every
// consumer uses: the Eleventy global data file (which renders the share pages)
// and the `eleventy.after` hook (which renders the PNGs). Both run in the same
// process, so the fetch is memoized at module level and happens exactly once
// per build.
//
// This module is TRANSPORT only: authenticate, paginate, memoize. Every bit of
// derivation and validation lives next door in `shape.mjs`.
//
// The build must NEVER fail because of this module. Any problem (no token,
// gateway down, bad status, malformed JSON) is a console.warn plus an empty,
// `configured: false` result — the rest of the site still ships.

import { EXPORT_TOKEN, GATEWAY_URL } from "./config.mjs";
import { shapeExport } from "./shape.mjs";

/** Page size we ASK for. The gateway is free to return fewer (it clamps). */
const PAGE_LIMIT = 1000;

/** Runaway guard for the pagination walk. 1000 pages = 1M certificates. */
const MAX_PAGES = 1000;

/** Per-request budget. A hung gateway must not hang the whole build. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Fresh empty result. Never share one object — consumers may sort in place. */
function emptyResult() {
  return { configured: false, events: [], items: [] };
}

/** Module-level memo. Shared by the data file and the eleventy.after hook. */
let pending = null;

/**
 * Load every published event and issued certificate for this build.
 *
 * @returns {Promise<{configured: boolean, events: object[], items: object[]}>}
 */
export async function loadCertificates() {
  pending ??= load();
  return pending;
}

async function load() {
  if (!EXPORT_TOKEN) {
    console.warn(
      "[certificates] CERTS_EXPORT_TOKEN is not set; building with no certificates.",
    );
    return emptyResult();
  }

  try {
    const raw = await fetchExport();
    const { events, items } = shapeExport(raw.events, raw.items);
    return { configured: true, events, items };
  } catch (err) {
    console.warn(
      `[certificates] export fetch failed: ${err.message}; building with no certificates.`,
    );
    return emptyResult();
  }
}

/**
 * Walk the paginated export until a page comes back EMPTY.
 *
 * A short page is not the end of the roster: the gateway clamps `limit` to its
 * own maximum and a proxy in between can cap it further, so "fewer than we
 * asked for" only ever means "a smaller page". Stopping there would silently
 * ship the first page and 404 every attendee behind it. The offset therefore
 * advances by what actually came back, and only an empty page ends the walk.
 */
async function fetchExport() {
  const items = [];
  let events = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await fetchPage(offset);
    // Every page repeats the full event list; the first one is enough.
    if (page === 0 && Array.isArray(body.events)) events = body.events;
    const pageItems = Array.isArray(body.items) ? body.items : [];
    if (pageItems.length === 0) return { events, items };
    items.push(...pageItems);
    offset += pageItems.length;
  }

  throw new Error(`export did not end after ${MAX_PAGES} pages`);
}

async function fetchPage(offset) {
  const res = await fetch(
    `${GATEWAY_URL}/v1/certs/export?limit=${PAGE_LIMIT}&offset=${offset}`,
    {
      headers: {
        Authorization: `Bearer ${EXPORT_TOKEN}`,
        Accept: "application/json",
        "User-Agent": "houston-website-build",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(describeStatus(res.status, offset));
  return await res.json();
}

function describeStatus(status, offset) {
  if (status === 401) return "gateway rejected CERTS_EXPORT_TOKEN (401)";
  if (status === 503) return "gateway has no certificates configured (503)";
  return `gateway returned ${status} at offset ${offset}`;
}
