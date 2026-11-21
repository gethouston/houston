import { formatMessageTime } from "@houston-ai/board";

export function formatLastMessageTime(
  iso: string,
  language: string,
  words: { now: string; yesterday: string },
  now = new Date(),
  dateStyle: "full" | "medium" = "full",
) {
  const locale = language.startsWith("pt")
    ? "pt-BR"
    : language.startsWith("es")
      ? "es"
      : "en-US";
  return formatMessageTime(iso, locale, words, now, dateStyle);
}
