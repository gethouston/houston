// Per-page locale resolution. `lang` arrives from a page's front matter or from
// a directory data file (src/es/es.11tydata.js and friends); anything without a
// `lang` falls back to English, so untranslated pages keep working.
//
// - `locale` is the entry from _data/locales.js (code, htmlLang, ogLocale, ...).
// - `t` is the translation tree for that locale, from _data/i18n/<lang>.js.
// - `localeRoot` is always the locale's URL prefix ("/", "/es/", "/pt/").
// - `root` prefixes the nav and footer SECTION anchors. On a landing page it is
//   "" so the links stay same-page anchors ("#pricing"); on any subpage it is
//   the locale root, so a Spanish subpage links back to "/es/#pricing".

export default {
  locale: (d) => d.locales[d.lang] || d.locales.en,
  t: (d) => d.i18n[d.locales[d.lang] ? d.lang : "en"],
  localeRoot: (d) => (d.locales[d.lang] || d.locales.en).dir,
  root: (d) => (d.isLandingPage ? "" : (d.locales[d.lang] || d.locales.en).dir),
};
