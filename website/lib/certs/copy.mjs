/**
 * Certificate image copy, per language.
 *
 * These strings are baked into the PNGs at build time, so they live here rather
 * than in the site's Nunjucks templates. `lang` comes from the event record
 * ("en" | "es"); anything unknown falls back to English.
 *
 * ONE credential noun everywhere: completion / finalización. Participation and
 * completion are materially different claims, and the printed document, the
 * share page, the Open Graph text and the LinkedIn credential all have to make
 * the same one (`src/certificates/certificates.11tydata.js` holds the HTML
 * half of the same vocabulary).
 */
const COPY = {
  en: {
    certificateOf: "CERTIFICATE OF COMPLETION",
    thisCertifies: "This certifies that",
    forCompleting: "for completing",
    issuedBy: "Issued by Houston",
    verifyAt: "Verify at",
  },
  es: {
    certificateOf: "CERTIFICADO DE FINALIZACIÓN",
    thisCertifies: "Se otorga a",
    forCompleting: "por completar",
    issuedBy: "Emitido por Houston",
    verifyAt: "Verifícalo en",
  },
};

/** Copy bundle for a language, falling back to English. */
export function certCopy(lang) {
  return COPY[lang] ?? COPY.en;
}

export default COPY;
