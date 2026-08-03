// Turning the raw gateway export into what every consumer actually reads.
//
// ALL derivation lives here and only here: snake_case -> camelCase, the
// event/item join, the display date, and every URL. Templates and the renderer
// consume ready-made fields; they never rebuild a URL or parse a date by hand.
//
// This is also the ONLY place remote data is validated. Everything downstream —
// Nunjucks templates, the satori renderer — assumes well formed input, and a
// template that throws takes the whole site build down with it. So a bad record
// is dropped or blanked HERE, with a warning, never passed on.

import { certPageUrl } from "./config.mjs";
import { formatEventDate, isoDateParts } from "./format.mjs";

/**
 * Shape a slug has to have to become a directory under `/certificates/`.
 * Lowercase words joined by single hyphens — anything else (a slash, a dot, an
 * empty string) would write outside the intended path.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs that would collide with a static page we already ship.
 *
 * An event page is `/certificates/<slug>/`, so an event slugged `verify` writes
 * to the very same file as `src/certificates/verify/index.html` and Eleventy
 * aborts the ENTIRE site build with DuplicatePermalinkOutputError. Slugs are
 * remote data (cloud's `slugPattern` permits `verify`), so an admin must not be
 * able to take gethouston.ai down by naming an event badly: reject it here,
 * where the build can still fail soft.
 */
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
  for (const item of items) {
    const event = eventsBySlug.get(item.event_slug);
    // An item whose event is unpublished (or was just rejected above) has
    // nothing to render on a page or a PNG. Skip it rather than emitting a
    // certificate with blank fields.
    if (!event) {
      orphans += 1;
      continue;
    }
    mappedItems.push(mapItem(item, event));
  }
  if (orphans > 0) {
    console.warn(
      `[certificates] skipped ${orphans} certificate(s) with no published event.`,
    );
  }

  return { events: mappedEvents, items: mappedItems };
}

/** Can this event own a page at `/certificates/<slug>/` without breaking one? */
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
  // A date that is not a plain YYYY-MM-DD is dropped rather than passed on:
  // templates derive the LinkedIn issue date from it, and half a date is worse
  // than none. The certificates themselves still ship.
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
    // Root-relative ON PURPOSE: this is the <img> and the `download` link on
    // the share page, and `download` is ignored cross-origin. Absolute would
    // point every non-production host (serve, preview channel, staging) at the
    // production pixels and turn the Download button into "open in a new tab".
    imageUrl: `/c/${item.code}.png`,
    // Absolute because it is an Open Graph value: scrapers need a full URL.
    ogImageUrl: `${pageUrl}.og.png`,
  };
}
