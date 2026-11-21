import { PAGE_TREES } from "../../lib/page-trees.js";
import computed from "../../src/_data/eleventyComputed.js";

const LOCALES = ["en", "es", "pt"];
const dir = new URL("../../src/_data/i18n/", import.meta.url);
const load = async (path) => (await import(new URL(path, dir))).default;

const i18n = {};
for (const code of LOCALES) i18n[code] = await load(`${code}.js`);
for (const page of PAGE_TREES) {
  i18n[page] = {};
  for (const code of LOCALES)
    i18n[page][code] = await load(`${page}/${code}.js`);
}

export const treeFor = (lang) =>
  computed.t({ lang, i18n, locales: { en: {}, es: {}, pt: {} } });
