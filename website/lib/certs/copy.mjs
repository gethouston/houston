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

export function certCopy(lang) {
  return COPY[lang] ?? COPY.en;
}

export default COPY;
