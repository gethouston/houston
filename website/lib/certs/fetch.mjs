import { EXPORT_TOKEN, GATEWAY_URL } from "./config.mjs";
import { shapeExport } from "./shape.mjs";

const PAGE_LIMIT = 1000;

const MAX_PAGES = 1000;

const REQUEST_TIMEOUT_MS = 10_000;

function emptyResult() {
  return { configured: false, events: [], items: [] };
}

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

async function fetchExport() {
  const items = [];
  let events = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await fetchPage(offset);
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
