import { strict as assert } from "node:assert";
import { afterEach, describe, it, mock } from "node:test";
import {
  FilePreviewError,
  type FilePreviewRefusalCode,
} from "@houston/wire-types/file-preview";
import type { ReactNode } from "react";
import { createFilesModule } from "../../packages/sdk/src/modules/files/index.ts";
import { planInvalidation } from "../src/lib/agent-invalidation-plan.ts";
import { removalEdit } from "../src/lib/file-list-patches.ts";
import { isNetworkTransportError } from "../src/lib/network-transport-error.ts";
import { runOptimisticWrite } from "../src/lib/optimistic-core.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import "./support/dom-env.ts";

const React = await import("react");
Object.assign(globalThis, { React });
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider, notifyManager } = await import(
  "@tanstack/react-query"
);

notifyManager.setScheduler(queueMicrotask);

let enabled = true;
let modified = 1;
let retryAfterMs: number | undefined;
const quietReports: unknown[] = [];
const entry = () => ({
  path: "deck.pptx",
  name: "deck.pptx",
  extension: "pptx",
  size: 20,
  is_directory: false,
  dateModified: modified,
  dateCreated: 1,
});
let refusal: FilePreviewRefusalCode | Error | null = null;
const original = new Blob(["original Office bytes"]);
let pdf = new Blob(["%PDF-converted"], { type: "application/pdf" });
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
mock.module(new URL("../src/lib/i18n.ts", import.meta.url).href, {
  defaultExport: { t },
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
const files = createFilesModule({
  registerCommand: () => {},
  config: {
    baseUrl: "http://host",
    ports: {
      clock: {
        now: () => 0,
        setTimeout: (fn: () => void) => {
          fn();
          return 0;
        },
      },
    },
  },
} as Parameters<typeof createFilesModule>[0]);
mock.module(new URL("../src/lib/quiet-error-report.ts", import.meta.url).href, {
  namedExports: {
    reportQuietError: (
      _kind: string,
      _command: string,
      _message: string,
      error: unknown,
    ) => quietReports.push(error),
  },
});
mock.module(new URL("../src/lib/error-toast.ts", import.meta.url).href, {
  namedExports: {
    showExpectedStateToast: () => {},
    showErrorToast: (command: string, _message: string, error: unknown) => {
      assert.equal(command, "office_preview");
      reports.push(error);
      return false;
    },
  },
});
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
      list: async () => [entry()],
      previewPlan: files.previewPlan,
      classifyPreviewRefusal: files.classifyPreviewRefusal,
      download: async (
        _agent: string,
        path: string,
        options?: { as?: string; lang?: string },
      ) => {
        const download = async () => {
          requests.push({ path, options });
          if (options?.as === "pdf") {
            if (refusal instanceof Error) throw refusal;
            if (refusal)
              throw new FilePreviewError(
                refusal,
                "preview refused",
                retryAfterMs,
              );
            return { blob: pdf, contentType: "application/pdf" };
          }
          return {
            blob: original,
            contentType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          };
        };
        return options?.as === "pdf" ? files.loadPreview(download) : download();
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
  modified = 1;
  retryAfterMs = undefined;
  quietReports.length = 0;
  refusal = null;
  pdf = new Blob(["%PDF-converted"], { type: "application/pdf" });
});
async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const render = async (open = true) =>
    act(async () => {
      root.render(
        h(
          QueryClientProvider,
          { client },
          h(FilePreviewDialog, {
            agentPath: "a1",
            filePath: open ? "deck.pptx" : null,
            fileName: "deck.pptx",
            onClose: () => {},
          }),
        ),
      );
    });
  await render();
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
  };
  return { container, client, render };
}

describe("Office file preview dialog", () => {
  it("renders the converted PDF, passes the UI locale, and saves the original file", async () => {
    const { container } = await mount();
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
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], {
      path: "deck.pptx",
      options: { toast: false },
    });
    assert.deepEqual(saved, [{ name: "deck.pptx", blob: original }]);
    await unmount?.();
    unmount = undefined;
    assert.deepEqual(revoked, ["blob:preview-1"]);
  });
  it("keeps the binary fallback when conversion is unavailable on this deployment", async () => {
    enabled = false;
    const { container } = await mount();
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
      const { container } = await mount();
      assert.equal(container.querySelector("iframe"), null);
      assert.match(
        container.textContent ?? "",
        /files.preview.unsupportedTitle/,
      );
      assert.equal(
        reports.length,
        code === "unsupported_type" || code === "too_large" ? 0 : 1,
      );
      if (reports.length) {
        assert.ok(reports[0] instanceof FilePreviewError);
        assert.equal(reports[0].code, code);
      }
      assert.equal(requests.length, 1);
      const download = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "files.preview.download",
      );
      assert.ok(download);
      await act(async () => {
        download.click();
      });
      assert.equal(saved[0]?.blob, original);
      assert.equal(requests.length, 2);
      assert.equal(requests[1]?.options?.as, undefined);
    });
  }
  for (const error of [
    new TypeError("fetch failed"),
    new SyntaxError("invalid JSON"),
  ]) {
    it(`falls back and reports ${error.name} with Download available`, async () => {
      refusal = error;
      const { container } = await mount();
      assert.match(
        container.textContent ?? "",
        /files.preview.unsupportedTitle/,
      );
      assert.doesNotMatch(
        container.textContent ?? "",
        /files.preview.errorTitle/,
      );
      assert.equal(reports.length, 1);
      assert.equal(reports[0], error);
      assert.equal(
        isNetworkTransportError(reports[0]),
        error instanceof TypeError,
      );
      const download = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "files.preview.download",
      );
      assert.ok(download);
      await act(async () => download.click());
      assert.equal(saved[0]?.blob, original);
    });
  }
  it("refreshes the PDF when an agent rewrites the open deck", async () => {
    const { container, client } = await mount();
    const first = container.querySelector("iframe")?.getAttribute("src");
    modified++;
    pdf = new Blob(["%PDF-rewritten"], { type: "application/pdf" });
    const plan = planInvalidation(
      { type: "FilesChanged", data: { agent_path: "a1" } },
      {},
    );
    await act(async () => {
      await Promise.all(
        plan.invalidate.map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
      await new Promise<void>((resolve) => {
        const unsubscribe = client.getQueryCache().subscribe(() => {
          if (client.isFetching() === 0) {
            unsubscribe();
            resolve();
          }
        });
        if (client.isFetching() === 0) {
          unsubscribe();
          resolve();
        }
      });
    });
    assert.equal(requests.length, 2);
    assert.ok(requests.every((request) => request.options?.as === "pdf"));
    assert.notEqual(
      container.querySelector("iframe")?.getAttribute("src"),
      first,
    );
    assert.equal(urls.at(-1), pdf);
  });
});

it("an optimistic delete never applies file-list patches to cached PDFs", async () => {
  const { client } = await mount();
  assert.equal(requests.length, 1);
  client.setQueryData(queryKeys.files("a1"), [entry()]);
  await act(async () => {
    await runOptimisticWrite(
      {
        qc: client,
        command: "delete_file",
        patches: [
          { queryKey: queryKeys.files("a1"), ...removalEdit(["deck.pptx"]) },
        ],
        write: async () => {},
        failure: { title: "failed", description: "failed" },
        invalidate: [],
      },
      () => assert.fail("delete refused"),
    );
  });
  assert.deepEqual(client.getQueryData(queryKeys.files("a1")), []);
});

it("unrelated file changes and finished turns preserve the open PDF", async () => {
  const { container, client } = await mount();
  const frame = container.querySelector("iframe");
  for (const event of [
    { type: "FilesChanged", data: { agent_path: "a1" } },
    {
      type: "SessionStatus",
      data: {
        agent_path: "a1",
        session_key: "s",
        status: "completed",
        error: null,
      },
    },
  ] as const) {
    await act(async () => {
      await Promise.all(
        planInvalidation(event, {}).invalidate.map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
    });
    assert.equal(requests.length, 1);
    assert.equal(container.querySelector("iframe"), frame);
    assert.equal(urls.length, 1);
  }
});

it("a failed rewrite keeps the previous PDF and URL", async () => {
  const { container, client } = await mount();
  const frame = container.querySelector("iframe");
  const src = frame?.getAttribute("src");
  modified++;
  refusal = "conversion_failed";
  await act(async () => {
    await Promise.all(
      planInvalidation(
        { type: "FilesChanged", data: { agent_path: "a1" } },
        {},
      ).invalidate.map((queryKey) => client.invalidateQueries({ queryKey })),
    );
  });
  assert.equal(requests.length, 2);
  assert.equal(container.querySelector("iframe"), frame);
  assert.equal(frame?.getAttribute("src"), src);
  assert.equal(urls.length, 1);
  assert.deepEqual(revoked, []);
});

it("reopening after a failure retries the PDF", async () => {
  refusal = "conversion_failed";
  const { container, client, render } = await mount();
  assert.match(container.textContent ?? "", /unsupportedTitle/);
  assert.ok(
    client
      .getQueryCache()
      .getAll()
      .some((query) => query.state.status === "error"),
  );
  await render(false);
  refusal = null;
  await render(true);
  assert.equal(requests.length, 2);
  assert.ok(container.querySelector("iframe"));
});

it("a missing Office file shows the existing gone-file state without a report", async () => {
  refusal = Object.assign(new Error("file not found"), { status: 404 });
  const { container } = await mount();
  assert.match(container.textContent ?? "", /files.gone.description/);
  assert.equal(reports.length, 0);
});

it("exhausted capacity retries report quietly and offer Download", async () => {
  refusal = "conversion_unavailable";
  retryAfterMs = 2000;
  const { container } = await mount();
  assert.match(container.textContent ?? "", /unsupportedTitle/);
  assert.equal(requests.length, 3);
  assert.equal(reports.length, 0);
  assert.equal(quietReports.length, 1);
});

it("unchanged PDF data preserves the object URL", async () => {
  const { container, client } = await mount();
  const frame = container.querySelector("iframe");
  const query = client
    .getQueryCache()
    .find({ queryKey: queryKeys.filePreviewPdfs("a1"), exact: false });
  assert.ok(query);
  await act(async () => {
    await query.fetch();
  });
  assert.equal(requests.length, 2);
  assert.equal(urls.length, 1);
  assert.equal(container.querySelector("iframe"), frame);
  assert.deepEqual(revoked, []);
});

it("closing the dialog releases its object URL", async () => {
  const { render } = await mount();
  await render(false);
  assert.deepEqual(revoked, ["blob:preview-1"]);
});
