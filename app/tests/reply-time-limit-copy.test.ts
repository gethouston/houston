import { strictEqual } from "node:assert";
import { test } from "node:test";
import i18next from "i18next";
import { NOTICE_COPY } from "../src/components/chat-notice-copy.ts";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

test("the reply ceiling notice selects authored copy in each shipped language", async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    resources: { en: { chat: en }, es: { chat: es }, pt: { chat: pt } },
    fallbackLng: "en",
  });
  strictEqual(NOTICE_COPY.turn_time_limit, "chat:replyTimeLimit");
  for (const [lang, bundle] of Object.entries({ en, es, pt })) {
    await i18n.changeLanguage(lang);
    strictEqual(i18n.t(NOTICE_COPY.turn_time_limit), bundle.replyTimeLimit);
    strictEqual(
      bundle.replyTimeLimit.includes("4 horas") ||
        bundle.replyTimeLimit.includes("4 hours"),
      true,
    );
    strictEqual(bundle.replyTimeLimit.includes("\u2014"), false);
    if (lang !== "en")
      strictEqual(bundle.replyTimeLimit === en.replyTimeLimit, false);
  }
});

test("the forced ceiling selects its own copy without claiming the last steps were saved", async () => {
  strictEqual(
    NOTICE_COPY.turn_time_limit_unsaved,
    "chat:replyTimeLimitUnsaved",
  );
  const i18n = i18next.createInstance();
  await i18n.init({
    resources: { en: { chat: en }, es: { chat: es }, pt: { chat: pt } },
    fallbackLng: "en",
  });
  const expected = {
    en: 'Your agent reached the 4-hour limit for one reply and stopped before it could save its last steps. Say "continue" to pick up from the last saved point.',
    es: 'Tu agente llegó al límite de 4 horas de una respuesta y se detuvo antes de guardar sus últimos pasos. Dile "continúa" para retomar desde el último punto guardado.',
    pt: 'Seu agente chegou ao limite de 4 horas de uma resposta e parou antes de salvar os últimos passos. Diga "continue" para retomar do último ponto salvo.',
  };
  for (const lang of ["en", "es", "pt"] as const) {
    await i18n.changeLanguage(lang);
    strictEqual(i18n.t(NOTICE_COPY.turn_time_limit_unsaved), expected[lang]);
    strictEqual(expected[lang].includes("\u2014"), false);
  }
});
