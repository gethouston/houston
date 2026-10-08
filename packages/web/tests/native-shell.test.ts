import { afterEach, expect, test, vi } from "vitest";
import { nativeShell, setNativeShell } from "../src/shims/native-shell";
import { invoke } from "../src/shims/tauri-core";

afterEach(() => {
  setNativeShell(null);
  vi.unstubAllGlobals();
});

test("web opens a tab and severs its opener", async () => {
  const tab = { opener: {} };
  const open = vi.fn(() => tab);
  vi.stubGlobal("window", { open });
  expect(await invoke("open_url", { url: "https://example.com" })).toBe(true);
  expect(open).toHaveBeenCalledWith("https://example.com", "_blank");
  expect(tab.opener).toBeNull();
});

test("native URLs use the registered shell without opening a WebView tab", async () => {
  const open = vi.fn();
  vi.stubGlobal("window", { open });
  const openUrl = vi.fn(async () => true);
  setNativeShell({ openUrl });
  expect(nativeShell()).not.toBeNull();
  expect(await invoke("open_url", { url: "https://example.com" })).toBe(true);
  expect(openUrl).toHaveBeenCalledWith("https://example.com");
  expect(open).not.toHaveBeenCalled();
  expect(
    await invoke("show_session_notification", { title: "Hello" }),
  ).toBeUndefined();
});
