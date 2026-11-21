import { useEffect, useState } from "react";
import { advanceDeck, createDeck, currentPhrase } from "./thinking-phrases";

export const PHRASE_ROTATE_MS = 4000;

export function useRotatingPhrase(phrases: string[] | undefined): string {
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    if (!phrases || phrases.length === 0) {
      setPhrase("");
      return;
    }
    let deck = createDeck(phrases, Math.random);
    setPhrase(currentPhrase(deck));
    const id = window.setInterval(() => {
      deck = advanceDeck(deck, Math.random);
      setPhrase(currentPhrase(deck));
    }, PHRASE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [phrases]);

  return phrase;
}
