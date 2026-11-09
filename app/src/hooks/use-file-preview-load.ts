import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Loaded } from "../components/file-preview-body";
import { genericErrorDescription } from "../lib/error-report";
import { showErrorToast } from "../lib/error-toast";
import { type FileBytes, fetchFileBytes } from "../lib/file-bytes-cache";
import { isFileGoneError } from "../lib/file-gone";
import { queryKeys } from "../lib/query-keys";
import { reportQuietError } from "../lib/quiet-error-report";
import { tauriFiles } from "../lib/tauri";
import { useFiles } from "./queries/use-files";
import { useCapabilities } from "./use-capabilities";
import { useSaveDownload } from "./use-save-download";

export function useFilePreviewLoad(
  agentPath: string,
  filePath: string | null,
  fileName: string,
  bytesCacheKey?: number,
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
  const listing = useFiles(agentPath, !!filePath && plan === "pdf");
  const source = listing.data?.find((file) => file.path === filePath);
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
    if (!filePath || (agentPath && lang && plan))
      setLoaded({ state: "loading" });
  }, [agentPath, filePath, lang, plan]);
  useEffect(() => {
    if (!pdf.error || plan !== "pdf" || !filePath) return;
    const refusal = files.classifyPreviewRefusal(pdf.error, { officePreview });
    if (refusal.fallback && refusal.report) {
      if (refusal.quiet)
        reportQuietError(
          refusal.quiet,
          "office_preview",
          refusal.error.message,
          refusal.error,
          { agentPath },
        );
      else
        showErrorToast("office_preview", refusal.error.message, refusal.error);
    } else if (!refusal.fallback && !isFileGoneError(refusal.error)) {
      showErrorToast("office_preview", String(refusal.error), refusal.error);
    }
    setLoaded((current) =>
      current.state === "pdf"
        ? current
        : !refusal.fallback && isFileGoneError(refusal.error)
          ? { state: "error", message: t("files.gone.description") }
          : { state: "binary" },
    );
  }, [pdf.error, plan, filePath, officePreview, agentPath, t]);

  useEffect(() => {
    if (!filePath || isLoading) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    if (plan === "pdf" && !pdfBlob) return;
    if (plan === "bytes") setLoaded({ state: "loading" });
    const bytes =
      plan === "pdf" && pdfBlob
        ? Promise.resolve({
            blob: pdfBlob,
            contentType: "application/pdf",
          })
        : fetchFileBytes(queryClient, agentPath, filePath, bytesCacheKey);
    bytes
      .then(async (data) => {
        if (cancelled) return;
        const { blob, contentType } = data;
        if (plan === "pdf" || contentType.includes("pdf")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({
            state: "pdf",
            url: objectUrl,
            ...(plan === "bytes" ? { blob } : {}),
          });
        } else if (
          contentType.startsWith("image/") ||
          contentType.includes("html")
        ) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({
            state: contentType.startsWith("image/") ? "image" : "html",
            url: objectUrl,
            blob,
          });
        } else if (
          contentType.startsWith("text/") ||
          contentType.includes("json") ||
          contentType.includes("csv")
        ) {
          const text = await blob.slice(0, 256 * 1024).text();
          if (!cancelled) setLoaded({ state: "text", text, blob });
        } else {
          setLoaded({ state: "binary", blob });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A gone file is the user's state (PRODUCT-1780): authored copy, no
        // report. Anything else is a fault and keeps the generic + report path.
        setLoaded({
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
    bytesCacheKey,
    queryClient,
    t,
    plan,
    pdfBlob,
    isLoading,
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
  return { loaded, canDownload, download };
}
