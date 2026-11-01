// Pages whose copy is its own data file per locale (_data/i18n/<page>/<lang>.js,
// loaded by Eleventy as i18n.<page>.<lang>). _data/eleventyComputed.js joins
// each onto the locale tree as `t.<page>`, and scripts/check-locales.mjs holds
// every one to the same parity. Kept out of _data/: Eleventy would read an
// export there as page data.
export const PAGE_TREES = [
  "enterprise",
  "dataPartners",
  "refer",
  "referBoard",
  "referListings",
];
