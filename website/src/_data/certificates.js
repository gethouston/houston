// Bootcamp certificates, fetched at build time. Eleventy 3.x supports async
// data files.
//
// The real work (fetch, pagination, mapping, URL derivation) lives in
// `lib/certs/fetch.mjs` so the `eleventy.after` PNG renderer can share the very
// same memoized result instead of hitting the gateway twice. Never fails the
// build: with no CERTS_EXPORT_TOKEN, or an unreachable gateway, this resolves
// to `{ configured: false, events: [], items: [] }`.
import { loadCertificates } from "../../lib/certs/fetch.mjs";

export default async function () {
  return loadCertificates();
}
