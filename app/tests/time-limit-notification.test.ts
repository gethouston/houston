import { strictEqual } from "node:assert";
import { mock, test } from "node:test";
import i18next from "i18next";
import { CompletionLatches } from "../src/hooks/completion-latches.ts";
import en from "../src/locales/en/common.json" with { type: "json" };
import es from "../src/locales/es/common.json" with { type: "json" };
import pt from "../src/locales/pt/common.json" with { type: "json" };

let body = "";
mock.module(
  new URL("../src/hooks/session-notifications.ts", import.meta.url).href,
  {
    namedExports: {
      sendSessionNotification: (_title: string, value: string) => {
        body = value;
      },
    },
  },
);
mock.module(
  new URL("../src/hooks/use-conversation-vm.ts", import.meta.url).href,
  {
    namedExports: {
      getConversationBoardStatus: () => "needs_you",
      getConversationInteraction: () => null,
    },
  },
);
mock.module(new URL("../src/lib/acting-user.ts", import.meta.url).href, {
  namedExports: { actingUser: () => null },
});
mock.module(
  new URL("../src/lib/all-conversations-cache.ts", import.meta.url).href,
  { namedExports: { latestCachedAllConversations: () => [] } },
);
mock.module(new URL("../src/lib/query-client.ts", import.meta.url).href, {
  namedExports: { queryClient: {} },
});
mock.module(new URL("../src/lib/logger.ts", import.meta.url).href, {
  namedExports: { logger: { debug: () => {} } },
});
const { latchCompletionNotification } = await import(
  "../src/hooks/completion-notification.ts"
);

test("the time-limit completion sends its own body in every language and an ordinary finish keeps its body", async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    resources: { en: { common: en }, es: { common: es }, pt: { common: pt } },
    fallbackLng: "en",
  });
  for (const lang of ["en", "es", "pt"]) {
    await i18n.changeLanguage(lang);
    const latches = new CompletionLatches(2000);
    const context = {
      agents: [],
      workspaceName: "Work",
      fallbackAgentName: "Agent",
      t: () => i18n.getFixedT(null, "common"),
      stopReason: "turn_time_limit" as const,
    };
    latchCompletionNotification(latches, "agent", "chat", context);
    latches.fireForAgent("agent");
    strictEqual(
      body,
      i18n.t("notifications.sessionComplete.timeLimit", { ns: "common" }),
    );
    strictEqual(
      body === i18n.t("notifications.sessionComplete.body", { ns: "common" }),
      false,
    );
    latchCompletionNotification(latches, "agent", "chat", {
      ...context,
      stopReason: undefined,
    });
    latches.fireForAgent("agent");
    strictEqual(
      body,
      i18n.t("notifications.sessionComplete.body", { ns: "common" }),
    );
    latches.dispose();
  }
});

test("time-limit notification names the AI Employee like neighbouring notifications and makes no saved-progress claim", () => {
  for (const [bundle, subject] of [
    [en, "Your AI Employee"],
    [es, "Tu empleado de IA"],
    [pt, "Seu funcionário de IA"],
  ] as const) {
    strictEqual(
      bundle.notifications.sessionComplete.timeLimit.startsWith(subject),
      true,
    );
    strictEqual(
      /saved|guardado|salvo/.test(
        bundle.notifications.sessionComplete.timeLimit,
      ),
      false,
    );
  }
});
