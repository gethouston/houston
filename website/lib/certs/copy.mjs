/**
 * Certificate image copy, per language.
 *
 * These strings are baked into the PNGs at build time, so they live here rather
 * than in the site's Nunjucks templates. `lang` comes from the event record
 * ("en" | "es"); anything unknown falls back to English.
 *
 * ONE credential noun everywhere: participation / participación (the
 * founder's call, 2026-08-04). The printed document, the
 * share page, the Open Graph text and the LinkedIn credential all have to make
 * the same one (`src/certificates/certificates.11tydata.js` holds the HTML
 * half of the same vocabulary).
 */
const COPY = {
  en: {
    certificateOf: "CERTIFICATE OF PARTICIPATION",
    thisCertifies: "This certifies that",
    forCompleting: "for participating in",
    issuedBy: "Issued by Houston",
    verifyAt: "Verify at",
  },
  es: {
    certificateOf: "CERTIFICADO DE PARTICIPACIÓN",
    thisCertifies: "Se otorga a",
    forCompleting: "por participar en",
    issuedBy: "Emitido por Houston",
    verifyAt: "Verifícalo en",
  },
};

/** Copy bundle for a language, falling back to English. */
export function certCopy(lang) {
  return COPY[lang] ?? COPY.en;
}

export default COPY;
