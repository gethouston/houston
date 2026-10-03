import type { AuthStatus, ProviderInfo } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { mergeProviders, overlayStatus } from "./merge";
import {
  nextReconnectNoticeChange,
  providerReconnectNotice,
  providerReconnectNotices,
  RECONNECT_NOTICE_DAYS,
} from "./reconnect";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 1, 12);

test("a connected login shows no notice until the window opens", () => {
  const status = { provider: "anthropic", connected: true };
  expect(providerReconnectNotice(status, now)).toBeNull();
  expect(
    providerReconnectNotice({ ...status, reconnectBy: now + 6 * DAY }, now),
  ).toBeNull();
  expect(
    providerReconnectNotice(
      { ...status, reconnectBy: now + RECONNECT_NOTICE_DAYS * DAY },
      now,
    ),
  ).toEqual({
    provider: "anthropic",
    reconnectBy: now + RECONNECT_NOTICE_DAYS * DAY,
    daysLeft: RECONNECT_NOTICE_DAYS,
  });
});

test("days left round down and stop at zero once the deadline is close or past", () => {
  const notice = (reconnectBy: number) =>
    providerReconnectNotice(
      { provider: "anthropic", connected: true, reconnectBy },
      now,
    )?.daysLeft;
  expect(notice(now + 2.9 * DAY)).toBe(2);
  expect(notice(now + 0.5 * DAY)).toBe(0);
  expect(notice(now - DAY)).toBe(0);
});

test("a provider that is not connected, or has a bad deadline, carries no notice", () => {
  expect(
    providerReconnectNotice(
      { provider: "anthropic", connected: false, reconnectBy: now + DAY },
      now,
    ),
  ).toBeNull();
  expect(
    providerReconnectNotice(
      { provider: "anthropic", connected: true, reconnectBy: Number.NaN },
      now,
    ),
  ).toBeNull();
});

test("notices list soonest first and skip the rest", () => {
  const notices = providerReconnectNotices(
    [
      { provider: "openai-codex", connected: true, reconnectBy: now + 3 * DAY },
      { provider: "anthropic", connected: true, reconnectBy: now + DAY },
      { provider: "github-copilot", connected: true },
    ],
    now,
  );
  expect(notices.map((n) => n.provider)).toEqual(["anthropic", "openai-codex"]);
});

test("the VM carries the list's deadline and a status overlay keeps it", () => {
  const infos = [
    {
      id: "anthropic",
      name: "Claude",
      configured: true,
      isActive: true,
      activeModel: "claude",
      models: ["claude"],
      reconnectBy: now + DAY,
    },
    {
      id: "openai-codex",
      name: "ChatGPT",
      configured: false,
      isActive: false,
      activeModel: "",
      models: [],
    },
  ] as ProviderInfo[];
  const auth: AuthStatus = {
    providers: [
      {
        provider: "anthropic",
        name: "Claude",
        configured: true,
        login: null,
        enterpriseUrl: null,
      },
    ],
    activeProvider: "anthropic",
  } as AuthStatus;
  const vm = mergeProviders(infos, auth);
  expect(vm.providers.find((p) => p.id === "anthropic")?.reconnectBy).toBe(
    now + DAY,
  );
  expect(vm.providers.find((p) => p.id === "openai-codex")).not.toHaveProperty(
    "reconnectBy",
  );
  expect(
    overlayStatus(vm, auth).providers.find((p) => p.id === "anthropic")
      ?.reconnectBy,
  ).toBe(now + DAY);
});

test("the next change is the window opening, then each day ticking down", () => {
  const status = (reconnectBy: number) => [
    { provider: "anthropic", connected: true, reconnectBy },
  ];
  // Ten days out: the window opens five days before.
  expect(nextReconnectNoticeChange(status(now + 10 * DAY), now)).toBe(
    now + 5 * DAY,
  );
  // 2.5 days out ("2 days"): it reads "1 day" once two whole days are left.
  const by = now + 2.5 * DAY;
  const next = nextReconnectNoticeChange(status(by), now);
  expect(next).toBe(by - 2 * DAY + 1);
  expect(
    providerReconnectNotice(
      { provider: "anthropic", connected: true, reconnectBy: by },
      next as number,
    )?.daysLeft,
  ).toBe(1);
  // At zero nothing changes on its own, and a signed-out row never does.
  expect(nextReconnectNoticeChange(status(now + DAY / 2), now)).toBeNull();
  expect(
    nextReconnectNoticeChange(
      [{ provider: "anthropic", connected: false, reconnectBy: now + DAY }],
      now,
    ),
  ).toBeNull();
});
