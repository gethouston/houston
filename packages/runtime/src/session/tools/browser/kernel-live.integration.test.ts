import { expect, test, vi } from "vitest";
import { agentWorkspace } from "./browser.test-support";
import { kernelFrom } from "./kernel";
import { kernelBackup } from "./kernel-tab";
import { browserStatePath } from "./state-store";
import { closeContext } from "./tab-pages";

const apiKey = process.env.KERNEL_API_KEY?.trim();

test.skipIf(!apiKey)(
  "a real Kernel tab opens a page and its session is deleted on close",
  { timeout: 90_000 },
  async () => {
    const kernel = kernelFrom(process.env);
    if (!kernel) throw new Error("unreachable: skipped without the key");
    const fetched = vi.fn(fetch);
    const backup = kernelBackup({ ...kernel, fetch: fetched });
    const statePath = browserStatePath(agentWorkspace("kernel-live-"));
    const tab = await backup.open(statePath, 3, "example.com");
    try {
      await tab.page.goto("https://example.com/");
      expect(await tab.page.title()).toBe("Example Domain");
    } finally {
      await closeContext(tab);
    }
    const methods = fetched.mock.calls.map(([, init]) => init?.method);
    expect(methods).toEqual(["POST", "DELETE"]);
  },
);
