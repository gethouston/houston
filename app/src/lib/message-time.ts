import { formatMessageTime } from "@houston-ai/board";

/** App language and translated words bind the board's i18n-agnostic formatter. */
export function formatLastMessageTime(
  iso: string,
  language: string,
  words: { now: string; yesterday: string },
  now = new Date(),
) {
  const locale = language.startsWith("pt")
    ? "pt-BR"
    : language.startsWith("es")
      ? "es"
      : "en-US";
  return formatMessageTime(iso, locale, words, now);
}
