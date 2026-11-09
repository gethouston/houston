import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFiles } from "../../hooks/queries/use-files";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSaveDownload } from "../../hooks/use-save-download";
import { genericErrorDescription } from "../../lib/error-report";
import { showErrorToast } from "../../lib/error-toast";
import {
  type FileBytes,
  fetchFileBytes,
  sharedBytesKey,
} from "../../lib/file-bytes-cache";
import { isFileGoneError } from "../../lib/file-gone";
import { queryKeys } from "../../lib/query-keys";
import { tauriFiles } from "../../lib/tauri";
import type { Loaded } from "./file-preview-body";
import { reportPreviewRefusal, sameBytes, shownBytes } from "./preview-bytes";

/**
 * A previewed file's bytes, as the panel renders them. Office files arrive as
 * their converted PDF, a .pdf as itself; both feed the page viewer as a blob.
 * The listing's current entry keys every load, so when the agent rewrites the
 * file the new bytes replace the old in place (no blank "loading" between),
 * and a reload that brings the same bytes changes nothing on screen.
 */
export function useFilePreviewLoad(
  agentPath: string,
  filePath: string | null,
  fileName: string,
) {
  const { t, i18n } = useTranslation("agents");
  const { capabilities, isLoading } = useCapabilities();
  const files = tauriFiles;
  const officePreview = capabilities?.officePreview;
  const plan = files.previewPlan(fileName, capabilities);
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const save = useSaveDownload();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  // What is on screen right now, readable from a load still in flight.
  const shown = useRef<Loaded>(loaded);
  const show = useCallback((next: Loaded) => {
    shown.current = next;
    setLoaded(next);
  }, []);
  const [attempt, setAttempt] = useState(0);
  const listing = useFiles(agentPath, !!filePath);
  const source = listing.data?.find((file) => file.path === filePath);
  const version = source?.dateModified;
  const bytesKey = source ? sharedBytesKey(source) : undefined;
  const listingPending = listing.isPending;
  const pdf = useQuery({
    queryKey: queryKeys.filePreviewPdf(
      agentPath,
      filePath,
      lang,
      source?.dateModified,
      source?.size,
    ),
    enabled: !!filePath && !isLoading && plan === "pdf" && !listing.isPending,
    retry: false,
    // Listing identities refresh PDFs. Failed entries have no data and retry on reopen.
    staleTime: "static",
    gcTime: 5 * 60_000,
    queryFn: (): Promise<FileBytes> =>
      tauriFiles.download(agentPath, filePath ?? "", {
        toast: false,
        as: "pdf",
        lang,
      }),
  });
  const pdfBlob = pdf.data?.blob;
  const url = "url" in loaded ? loaded.url : undefined;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    if (!filePath || (agentPath && lang && plan)) show({ state: "loading" });
  }, [agentPath, filePath, lang, plan, show]);
  useEffect(() => {
    if (!pdf.error || plan !== "pdf" || !filePath) return;
    const refusal = files.classifyPreviewRefusal(pdf.error, { officePreview });
    reportPreviewRefusal(refusal, agentPath);
    if (shown.current.state !== "pdf")
      show(
        !refusal.fallback && isFileGoneError(refusal.error)
          ? { state: "error", message: t("files.gone.description") }
          : { state: "binary" },
      );
  }, [pdf.error, plan, filePath, officePreview, agentPath, t, show]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` (the file was rewritten) and `attempt` (Try again) re-run the load
  useEffect(() => {
    if (!filePath || isLoading || listingPending) return;
    let cancelled = false;
    if (plan === "pdf" && !pdfBlob) return;
    const bytes =
      plan === "pdf" && pdfBlob
        ? Promise.resolve({
            blob: pdfBlob,
            contentType: "application/pdf",
          })
        : fetchFileBytes(queryClient, agentPath, filePath, bytesKey);
    bytes
      .then(async (data) => {
        if (cancelled) return;
        const { blob, contentType } = data;
        const previous = shownBytes(shown.current);
        if (previous && (await sameBytes(previous, blob))) return;
        if (cancelled) return;
        if (plan === "pdf" || contentType.includes("pdf")) {
          show({
            state: "pdf",
            data: blob,
            ...(plan === "bytes" ? { blob } : {}),
          });
        } else if (
          contentType.startsWith("image/") ||
          contentType.includes("html")
        ) {
          show({
            state: contentType.startsWith("image/") ? "image" : "html",
            url: URL.createObjectURL(blob),
            blob,
          });
        } else if (
          contentType.startsWith("text/") ||
          contentType.includes("json") ||
          contentType.includes("csv")
        ) {
          const text = await blob.slice(0, 256 * 1024).text();
          if (!cancelled) show({ state: "text", text, blob });
        } else {
          show({ state: "binary", blob });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A gone file is the user's state (PRODUCT-1780): authored copy, no
        // report. Anything else is a fault and keeps the generic + report path.
        show({
          state: "error",
          message: isFileGoneError(error)
            ? t("files.gone.description")
            : genericErrorDescription("preview_file", error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    agentPath,
    filePath,
    bytesKey,
    queryClient,
    t,
    plan,
    pdfBlob,
    isLoading,
    version,
    attempt,
    listingPending,
    show,
  ]);

  const blob = "blob" in loaded ? loaded.blob : undefined;
  const canDownload = !!blob || (plan === "pdf" && loaded.state !== "loading");
  const download = async () => {
    if (!filePath) return;
    try {
      const original =
        blob ??
        (await tauriFiles.download(agentPath, filePath, { toast: false })).blob;
      await save(fileName, original);
    } catch (error) {
      showErrorToast("download_file", "File download failed", error);
    }
  };
  const refetchPdf = pdf.refetch;
  const retry = () => {
    show({ state: "loading" });
    if (plan === "pdf") void refetchPdf();
    else setAttempt((n) => n + 1);
  };
  return { loaded, canDownload, download, retry, converts: plan === "pdf" };
}
