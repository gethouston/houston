import { strict as assert } from "node:assert";
import { afterEach, describe, it, mock } from "node:test";
import {
  FilePreviewError,
  type FilePreviewRefusalCode,
} from "@houston/wire-types/file-preview";
import type { ReactNode } from "react";
import "./support/dom-env.ts";

const React = await import("react");
Object.assign(globalThis, { React });
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
);

let enabled = true;
let refusal: FilePreviewRefusalCode | null = null;
const original = new Blob(["original Office bytes"]);
const pdf = new Blob(["%PDF-converted"], { type: "application/pdf" });
const requests: { path: string; options?: { as?: string; lang?: string } }[] =
  [];
const saved: { name: string; blob: Blob }[] = [];
const reports: unknown[] = [];
const urls: Blob[] = [];
const revoked: string[] = [];
const t = (key: string) => key;
const passthrough = ({ children }: { children?: ReactNode }) =>
  h("div", null, children);
mock.module("@houston-ai/core", {
  namedExports: {
    Button: ({
      children,
      onClick,
    }: {
      children?: ReactNode;
      onClick?: () => void;
    }) => h("button", { onClick }, children),
    previewKind: () => null,
    cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
    Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? h("div", null, children) : null,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
  },
});
mock.module("@houston-ai/chat", {
  namedExports: { MessageResponse: passthrough },
});
mock.module("react-i18next", {
  namedExports: { useTranslation: () => ({ t, i18n: { language: "es-CO" } }) },
});
mock.module(new URL("../src/hooks/use-capabilities.ts", import.meta.url).href, {
  namedExports: {
    useCapabilities: () => ({
      capabilities: { officePreview: enabled },
      isLoading: false,
    }),
  },
});
mock.module(
  new URL("../src/hooks/use-open-agent-file.tsx", import.meta.url).href,
  {
    namedExports: {
      useOpenAgentHref: () => () => {},
    },
  },
);
mock.module(
  new URL("../src/hooks/use-save-download.ts", import.meta.url).href,
  {
    namedExports: {
      useSaveDownload: () => async (name: string, blob: Blob) => {
        saved.push({ name, blob });
      },
    },
  },
);
mock.module(new URL("../src/lib/error-report.ts", import.meta.url).href, {
  namedExports: {
    logAndReportError: (_command: string, error: unknown) => {
      reports.push(error);
    },
    genericErrorDescription: (_command: string, error: unknown) => {
      reports.push(error);
      return "error";
    },
  },
});
mock.module(new URL("../src/lib/tauri.ts", import.meta.url).href, {
  namedExports: {
    tauriFiles: {
      download: async (
        _agent: string,
        path: string,
        options?: { as?: string; lang?: string },
      ) => {
        requests.push({ path, options });
        if (options?.as === "pdf") {
          if (refusal) throw new FilePreviewError(refusal, "preview refused");
          return { blob: pdf, contentType: "application/pdf" };
        }
        return {
          blob: original,
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
      },
    },
  },
});
URL.createObjectURL = (blob) => {
  urls.push(blob);
  return `blob:preview-${urls.length}`;
};
URL.revokeObjectURL = (url) => {
  revoked.push(url);
};
const { FilePreviewDialog } = await import(
  "../src/components/file-preview-dialog.tsx"
);
let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  requests.length =
    saved.length =
    reports.length =
    urls.length =
    revoked.length =
      0;
  enabled = true;
  refusal = null;
});
async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(FilePreviewDialog, {
          agentPath: "a1",
          filePath: "deck.pptx",
          fileName: "deck.pptx",
          onClose: () => {},
        }),
      ),
    );
  });
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
  };
  return container;
}

describe("Office file preview dialog", () => {
  it("renders the converted PDF, passes the UI locale, and saves the original file", async () => {
    const container = await mount();
    assert.equal(
      container.querySelector("iframe")?.getAttribute("src"),
      "blob:preview-1",
    );
    assert.equal(
      container.querySelector("iframe")?.getAttribute("title"),
      "deck.pptx",
    );
    assert.deepEqual(urls, [pdf]);
    assert.deepEqual(requests, [
      { path: "deck.pptx", options: { toast: false } },
      {
        path: "deck.pptx",
        options: { toast: false, as: "pdf", lang: "es-CO" },
      },
    ]);
    const download = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "files.preview.download",
    );
    assert.ok(download);
    await act(async () => {
      download.click();
    });
    assert.deepEqual(saved, [{ name: "deck.pptx", blob: original }]);
    await unmount?.();
    unmount = undefined;
    assert.deepEqual(revoked, ["blob:preview-1"]);
  });
  it("keeps the binary fallback when conversion is unavailable on this deployment", async () => {
    enabled = false;
    const container = await mount();
    assert.equal(container.querySelector("iframe"), null);
    assert.match(container.textContent ?? "", /files.preview.unsupportedTitle/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.options?.as, undefined);
  });
  for (const code of [
    "unsupported_type",
    "too_large",
    "conversion_unavailable",
    "timeout",
    "conversion_failed",
  ] as const) {
    it(`falls back on ${code} and reports only failed conversions`, async () => {
      refusal = code;
      const container = await mount();
      assert.equal(container.querySelector("iframe"), null);
      assert.match(
        container.textContent ?? "",
        /files.preview.unsupportedTitle/,
      );
      assert.equal(
        reports.length,
        code === "timeout" || code === "conversion_failed" ? 1 : 0,
      );
      const download = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "files.preview.download",
      );
      assert.ok(download);
      await act(async () => {
        download.click();
      });
      assert.equal(saved[0]?.blob, original);
    });
  }
});
