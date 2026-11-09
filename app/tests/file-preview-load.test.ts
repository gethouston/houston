import { strict as assert } from "node:assert";
import { afterEach, describe, it, mock } from "node:test";
import {
  FilePreviewError,
  type FilePreviewRefusalCode,
} from "@houston/wire-types/file-preview";
import { createFilesModule } from "../../packages/sdk/src/modules/files/index.ts";
import { planInvalidation } from "../src/lib/agent-invalidation-plan.ts";
import { isNetworkTransportError } from "../src/lib/network-transport-error.ts";
import "./support/dom-env.ts";

// The preview panel's load: an Office file arrives as its converted PDF, any
// other file as its bytes, and a rewrite the listing reports swaps the new
// bytes in place. Ported from the retired dialog's suite, now against the hook
// the panel renders from.

const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider, notifyManager } = await import(
  "@tanstack/react-query"
);
notifyManager.setScheduler(queueMicrotask);

let enabled = true;
let modified = 1;
let retryAfterMs: number | undefined;
let refusal: FilePreviewRefusalCode | Error | null = null;
let listed = "deck.pptx";
const original = new Blob(["original Office bytes"]);
let pdf = new Blob(["%PDF-converted"], { type: "application/pdf" });
let image = new Blob(["png-1"], { type: "image/png" });
const requests: { path: string; options?: { as?: string; lang?: string } }[] =
  [];
const saved: { name: string; blob: Blob }[] = [];
const reports: unknown[] = [];
const quietReports: unknown[] = [];
const revoked: string[] = [];
let urlCount = 0;
const t = (key: string) => key;

const entry = () => ({
  path: listed,
  name: listed,
  extension: listed.split(".").pop() ?? "",
  size: 20,
  is_directory: false,
  dateModified: modified,
  dateCreated: 1,
});

mock.module("@houston-ai/core", {
  namedExports: {
    previewKind: (file: { extension: string }) =>
      file.extension === "png" ? "image" : null,
  },
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
  new URL("../src/hooks/use-save-download.ts", import.meta.url).href,
  {
    namedExports: {
      useSaveDownload: () => async (name: string, blob: Blob) => {
        saved.push({ name, blob });
      },
    },
  },
);
mock.module(new URL("../src/lib/quiet-error-report.ts", import.meta.url).href, {
  namedExports: {
    reportQuietError: (_k: string, _c: string, _m: string, error: unknown) =>
      quietReports.push(error),
  },
});
mock.module(new URL("../src/lib/error-toast.ts", import.meta.url).href, {
  namedExports: {
    showExpectedStateToast: () => {},
    showErrorToast: (_command: string, _message: string, error: unknown) => {
      reports.push(error);
      return false;
    },
  },
});
mock.module(new URL("../src/lib/error-report.ts", import.meta.url).href, {
  namedExports: {
    logAndReportError: (_command: string, error: unknown) =>
      reports.push(error),
    genericErrorDescription: (_command: string, error: unknown) => {
      reports.push(error);
      return "error";
    },
  },
});
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
          if (path.endsWith(".png"))
            return { blob: image, contentType: "image/png" };
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
URL.createObjectURL = () => `blob:preview-${++urlCount}`;
URL.revokeObjectURL = (url) => {
  revoked.push(url);
};

const { useFilePreviewLoad } = await import(
  "../src/components/file-preview/use-file-preview-load.ts"
);
type Load = ReturnType<typeof useFilePreviewLoad>;

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  requests.length = saved.length = reports.length = revoked.length = 0;
  quietReports.length = urlCount = 0;
  enabled = true;
  modified = 1;
  retryAfterMs = undefined;
  refusal = null;
  listed = "deck.pptx";
  pdf = new Blob(["%PDF-converted"], { type: "application/pdf" });
  image = new Blob(["png-1"], { type: "image/png" });
});

/** Let every load, byte comparison and query notification land. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++)
      await new Promise<void>((resolve) => setImmediate(resolve));
  });

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view: { current: Load | null } = { current: null };
  function Harness({ open }: { open: boolean }) {
    view.current = useFilePreviewLoad("a1", open ? listed : null, listed);
    return null;
  }
  const render = async (open = true) => {
    await act(async () => {
      root.render(h(QueryClientProvider, { client }, h(Harness, { open })));
    });
    await flush();
  };
  await render();
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
  };
  const loaded = () => view.current?.loaded;
  const rewrite = async () => {
    await act(async () => {
      await Promise.all(
        planInvalidation(
          { type: "FilesChanged", data: { agent_path: "a1" } },
          {},
        ).invalidate.map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    });
    await flush();
  };
  return { client, render, loaded, view, rewrite };
}

const pdfOf = (l: Load["loaded"] | undefined) =>
  l?.state === "pdf" ? l.data : undefined;

describe("file preview load", () => {
  it("renders the converted PDF, passes the UI locale, and saves the original file", async () => {
    const { loaded, view } = await mount();
    assert.equal(pdfOf(loaded()), pdf);
    assert.deepEqual(requests, [
      {
        path: "deck.pptx",
        options: { toast: false, as: "pdf", lang: "es-CO" },
      },
    ]);
    assert.ok(view.current?.canDownload);
    await act(async () => view.current?.download());
    assert.deepEqual(requests[1], {
      path: "deck.pptx",
      options: { toast: false },
    });
    assert.deepEqual(saved, [{ name: "deck.pptx", blob: original }]);
  });

  it("keeps the binary fallback when conversion is unavailable on this deployment", async () => {
    enabled = false;
    const { loaded } = await mount();
    assert.equal(loaded()?.state, "binary");
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
      const { loaded, view } = await mount();
      assert.equal(loaded()?.state, "binary");
      assert.equal(
        reports.length,
        code === "unsupported_type" || code === "too_large" ? 0 : 1,
      );
      if (reports.length) {
        assert.ok(reports[0] instanceof FilePreviewError);
        assert.equal(reports[0].code, code);
      }
      assert.ok(view.current?.canDownload);
      await act(async () => view.current?.download());
      assert.equal(saved[0]?.blob, original);
      assert.equal(requests.at(-1)?.options?.as, undefined);
    });
  }

  for (const error of [
    new TypeError("fetch failed"),
    new SyntaxError("invalid JSON"),
  ]) {
    it(`falls back and reports ${error.name} with Download available`, async () => {
      refusal = error;
      const { loaded, view } = await mount();
      assert.equal(loaded()?.state, "binary");
      assert.deepEqual(reports, [error]);
      assert.equal(
        isNetworkTransportError(reports[0]),
        error instanceof TypeError,
      );
      await act(async () => view.current?.download());
      assert.equal(saved[0]?.blob, original);
    });
  }

  it("refreshes the PDF when an agent rewrites the open deck", async () => {
    const { loaded, rewrite } = await mount();
    modified++;
    pdf = new Blob(["%PDF-rewritten"], { type: "application/pdf" });
    await rewrite();
    assert.equal(requests.length, 2);
    assert.ok(requests.every((r) => r.options?.as === "pdf"));
    assert.equal(pdfOf(loaded()), pdf);
  });

  it("unrelated file changes and finished turns preserve the open PDF", async () => {
    const { client, loaded } = await mount();
    const before = loaded();
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
      await flush();
      assert.equal(requests.length, 1);
      assert.equal(loaded(), before);
    }
  });

  it("a failed rewrite keeps the previous PDF", async () => {
    const { loaded, rewrite } = await mount();
    const before = loaded();
    modified++;
    refusal = "conversion_failed";
    await rewrite();
    assert.equal(requests.length, 2);
    assert.equal(loaded(), before);
  });

  it("reopening after a failure retries the PDF", async () => {
    refusal = "conversion_failed";
    const { loaded, render, client } = await mount();
    assert.equal(loaded()?.state, "binary");
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
    assert.equal(pdfOf(loaded()), pdf);
  });

  it("a missing Office file shows the gone-file state without a report", async () => {
    refusal = Object.assign(new Error("file not found"), { status: 404 });
    const { loaded } = await mount();
    assert.deepEqual(loaded(), {
      state: "error",
      message: "files.gone.description",
    });
    assert.equal(reports.length, 0);
  });

  it("exhausted capacity retries report quietly and offer Download", async () => {
    refusal = "conversion_unavailable";
    retryAfterMs = 2000;
    const { loaded, view } = await mount();
    assert.equal(loaded()?.state, "binary");
    assert.equal(requests.length, 3);
    assert.equal(reports.length, 0);
    assert.equal(quietReports.length, 1);
    assert.ok(view.current?.canDownload);
  });

  it("a reload that brings the same bytes changes nothing on screen", async () => {
    const { loaded, rewrite } = await mount();
    const before = loaded();
    modified++;
    pdf = new Blob(["%PDF-converted"], { type: "application/pdf" });
    await rewrite();
    assert.equal(requests.length, 2);
    assert.equal(loaded(), before);
  });

  it("a rewritten image opened from the Files tab shows the new bytes", async () => {
    listed = "chart.png";
    const { loaded, rewrite } = await mount();
    assert.equal(loaded()?.state, "image");
    modified++;
    image = new Blob(["png-2"], { type: "image/png" });
    await rewrite();
    const shown = loaded();
    assert.equal(shown && "blob" in shown ? shown.blob : undefined, image);
  });

  it("closing the preview releases its object URL", async () => {
    listed = "chart.png";
    const { render, loaded } = await mount();
    const shown = loaded();
    assert.equal(shown?.state, "image");
    await render(false);
    assert.deepEqual(revoked, [shown && "url" in shown ? shown.url : ""]);
  });
});
