// The site's locale registry. `order` drives every list that has to be stable
// (language switcher, hreflang block, sitemap). Each entry carries the values a
// template needs verbatim: `htmlLang` for <html lang>, `hreflang` for the
// alternate links, `ogLocale` for Open Graph, `dir` for the URL prefix (the
// default locale lives at the root), and the labels for the switcher.

export default {
  order: ["en", "es", "pt"],
  en: {
    code: "en",
    htmlLang: "en",
    hreflang: "en",
    ogLocale: "en_US",
    dir: "/",
    label: "English",
    short: "EN",
    isDefault: true,
  },
  es: {
    code: "es",
    htmlLang: "es",
    hreflang: "es",
    ogLocale: "es_LA",
    dir: "/es/",
    label: "Español",
    short: "ES",
  },
  pt: {
    code: "pt",
    htmlLang: "pt-BR",
    hreflang: "pt-br",
    ogLocale: "pt_BR",
    dir: "/pt/",
    label: "Português",
    short: "PT",
  },
};
