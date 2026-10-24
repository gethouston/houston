// Interface strings shared by the lesson components. Lesson text itself lives in the MDX files.
export const ui = {
  en: {
    copy: "Copy",
    copied: "Copied",
    prompt: "Tell Claude",
    next: "Next",
    back: "Back",
    restart: "Start over",
    step: "Step",
    of: "of",
    redFlag: "Houston, we have a problem",
    checklistDone: "All done. Nice work.",
    checklistProgress: "done",
    replay: "Illustrative session",
    replayNote: "A re-creation of a typical session, simplified",
    explainBack: "Explain it back",
    yourAnswer: "Write your answer in your own words…",
    goodAnswer: "A good answer mentions",
  },
  es: {
    copy: "Copiar",
    copied: "Copiado",
    prompt: "Dile a Claude",
    next: "Siguiente",
    back: "Atrás",
    restart: "Empezar de nuevo",
    step: "Paso",
    of: "de",
    redFlag: "Houston, tenemos un problema",
    checklistDone: "Todo listo. Buen trabajo.",
    checklistProgress: "listos",
    replay: "Sesión ilustrativa",
    replayNote: "Una recreación simplificada de una sesión típica",
    explainBack: "Explícalo con tus palabras",
    yourAnswer: "Escribe tu respuesta con tus propias palabras…",
    goodAnswer: "Una buena respuesta menciona",
  },
} as const;

export type Lang = keyof typeof ui;

export function langOf(locale: string | undefined): Lang {
  return locale === "es" ? "es" : "en";
}
