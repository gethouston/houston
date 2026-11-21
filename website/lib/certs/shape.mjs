import { certPageUrl } from "./config.mjs";
import { formatEventDate, isoDateParts } from "./format.mjs";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CODE_RE = /^HOU-[0-9A-Z]{5}-[0-9A-Z]{5}$/;

const RESERVED_EVENT_SLUGS = new Set(["verify"]);

/**
 * Join the export's events and items into the structure the site renders.
 *
 * @param {object[]} events Raw event records from the export.
 * @param {object[]} items Raw certificate records from the export.
 * @returns {{events: object[], items: object[]}} Mapped, validated, joined.
 */
export function shapeExport(events, items) {
  const mappedEvents = events.filter(isPublishable).map(mapEvent);
  const eventsBySlug = new Map(mappedEvents.map((e) => [e.slug, e]));

  const mappedItems = [];
  let orphans = 0;
  let malformed = 0;
  let badNames = 0;
  for (const item of items) {
    if (!CODE_RE.test(typeof item?.code === "string" ? item.code : "")) {
      malformed += 1;
      continue;
    }
    if (!isRenderableName(item.display_name)) {
      badNames += 1;
      continue;
    }
    const event = eventsBySlug.get(item.event_slug);
    if (!event) {
      orphans += 1;
      continue;
    }
    mappedItems.push(mapItem(item, event));
  }
  if (malformed > 0) {
    console.warn(
      `[certificates] skipped ${malformed} certificate(s) whose code is not a HOU-XXXXX-XXXXX code.`,
    );
  }
  if (badNames > 0) {
    console.warn(
      `[certificates] skipped ${badNames} certificate(s) whose display name is not renderable.`,
    );
  }
  if (orphans > 0) {
    console.warn(
      `[certificates] skipped ${orphans} certificate(s) with no published event.`,
    );
  }

  return { events: mappedEvents, items: mappedItems };
}

function isRenderableName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || [...trimmed].length > 80) return false;
  const forbidden =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200b\u2060\ufeff]/;
  if (forbidden.test(trimmed)) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function isPublishable(event) {
  const slug = typeof event?.slug === "string" ? event.slug : "";
  if (!SLUG_RE.test(slug)) {
    console.warn(
      `[certificates] skipped event with unusable slug ${JSON.stringify(slug)}.`,
    );
    return false;
  }
  if (RESERVED_EVENT_SLUGS.has(slug)) {
    console.warn(
      `[certificates] skipped event "${slug}": that slug is reserved by a static page at /certificates/${slug}/.`,
    );
    return false;
  }
  return true;
}

function mapEvent(event) {
  const lang = event.lang === "es" ? "es" : "en";
  const date = isoDateParts(event.event_date);
  return {
    slug: event.slug,
    title: event.title,
    tagline: event.tagline,
    eventDate: date ? event.event_date : "",
    eventDateDisplay: formatEventDate(event.event_date, lang),
    issueYear: date ? date.year : null,
    issueMonth: date ? date.month : null,
    lang,
    location: event.location,
    certName: event.cert_name,
    linkedinOrgId: event.linkedin_org_id,
  };
}

function mapItem(item, event) {
  const pageUrl = certPageUrl(item.code);
  return {
    code: item.code,
    displayName: item.display_name,
    eventSlug: item.event_slug,
    eventTitle: event.title,
    eventTagline: event.tagline,
    eventDate: event.eventDate,
    eventDateDisplay: event.eventDateDisplay,
    issueYear: event.issueYear,
    issueMonth: event.issueMonth,
    lang: event.lang,
    location: event.location,
    certName: event.certName,
    linkedinOrgId: event.linkedinOrgId,
    pageUrl,
    imageUrl: `/c/${item.code}.png`,
    ogImageUrl: `${pageUrl}.og.png`,
  };
}
