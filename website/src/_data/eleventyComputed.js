import { PAGE_TREES } from "../../lib/page-trees.js";

export default {
  locale: (d) => d.locales[d.lang] || d.locales.en,
  t: (d) => {
    const lang = d.locales[d.lang] ? d.lang : "en";
    const pages = PAGE_TREES.map((page) => [page, d.i18n[page][lang]]);
    return { ...d.i18n[lang], ...Object.fromEntries(pages) };
  },
  localeRoot: (d) => (d.locales[d.lang] || d.locales.en).dir,
  root: (d) => (d.isLandingPage ? "" : (d.locales[d.lang] || d.locales.en).dir),
};
