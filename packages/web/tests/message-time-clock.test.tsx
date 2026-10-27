import "../../../app/tests/support/dom-env";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { useMessageTime } from "../../../app/src/hooks/use-message-time";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "time.now" ? "Now" : "Yesterday"),
    i18n: { language: "en" },
  }),
}));
afterEach(() => vi.useRealTimers());

function Label({ iso }: { iso: string }) {
  return <span>{useMessageTime()(iso).short}</span>;
}

test("one presentation clock advances mounted labels at minute boundaries and midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T23:58:00"));
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <>
          <Label iso="2026-10-27T23:58:00" />
          <Label iso="2026-10-27T23:00:00" />
        </>,
      ),
    );
    expect([...host.children].map((el) => el.textContent)).toEqual([
      "Now",
      "11:00 PM",
    ]);
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect([...host.children].map((el) => el.textContent)).toEqual([
      "11:58 PM",
      "11:00 PM",
    ]);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect([...host.children].map((el) => el.textContent)).toEqual([
      "Yesterday",
      "Yesterday",
    ]);
  } finally {
    await act(async () => root.unmount());
  }
  expect(vi.getTimerCount()).toBe(0);
});

test("the shared clock aligns its first tick to the next minute", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T23:59:45"));
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Label iso="2026-10-27T23:00:00" />));
    expect(host.textContent).toBe("11:00 PM");
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(host.textContent).toBe("11:00 PM");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(host.textContent).toBe("Yesterday");
  } finally {
    await act(async () => root.unmount());
  }
});
