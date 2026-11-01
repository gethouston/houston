// Per-page locale resolution. `lang` arrives from a page's front matter or from
// a directory data file (src/es/es.11tydata.js and friends); anything without a
// `lang` falls back to English, so untranslated pages keep working.
//
// - `locale` is the entry from _data/locales.js (code, htmlLang, ogLocale, ...).
// - `t` is the translation tree for that locale, from _data/i18n/<lang>.js
//   (plus `t.enterprise` and `t.dataPartners`, see below).
// - `localeRoot` is always the locale's URL prefix ("/", "/es/", "/pt/").
// - `root` prefixes the nav and footer SECTION anchors. On a landing page it is
//   "" so the links stay same-page anchors ("#pricing"); on any subpage it is
//   the locale root, so a Spanish subpage links back to "/es/#pricing".

export default {
  locale: (d) => d.locales[d.lang] || d.locales.en,
  // The /enterprise and /data-partners copy are their own data files per
  // locale (_data/i18n/<page>/<lang>.js, loaded by Eleventy as
  // i18n.<page>.<lang>), joined onto the tree here as `t.enterprise` and
  // `t.dataPartners`.
  // Joined, not imported from <lang>.js: Eleventy reloads a data file on
  // save, but not a module that data file imports, so an import would serve
  // stale copy in `npm run dev`.
  t: (d) => {
    const lang = d.locales[d.lang] ? d.lang : "en";
    return {
      ...d.i18n[lang],
      enterprise: d.i18n.enterprise[lang],
      dataPartners: d.i18n.dataPartners[lang],
    };
  },
  localeRoot: (d) => (d.locales[d.lang] || d.locales.en).dir,
  root: (d) => (d.isLandingPage ? "" : (d.locales[d.lang] || d.locales.en).dir),
};
