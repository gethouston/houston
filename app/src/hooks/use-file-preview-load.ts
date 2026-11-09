import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Loaded } from "../components/file-preview-body";
import { genericErrorDescription } from "../lib/error-report";
import { showErrorToast } from "../lib/error-toast";
import { type FileBytes, fetchFileBytes } from "../lib/file-bytes-cache";
import { isFileGoneError } from "../lib/file-gone";
import { queryKeys } from "../lib/query-keys";
import { tauriFiles } from "../lib/tauri";
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
  const plan = files.previewPlan(fileName, capabilities);
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const save = useSaveDownload();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const pdf = useQuery({
    queryKey: [...queryKeys.files(agentPath), "preview-pdf", filePath, lang],
    enabled: !!filePath && !isLoading && plan === "pdf",
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<FileBytes | null> => {
      try {
        return await tauriFiles.download(agentPath, filePath ?? "", {
          toast: false,
          as: "pdf",
          lang,
        });
      } catch (error) {
        const refusal = files.classifyPreviewRefusal(error, capabilities);
        if (refusal.report)
          showErrorToast(
            "office_preview",
            refusal.error.message,
            refusal.error,
          );
        return null;
      }
    },
  });

  useEffect(() => {
    if (!filePath || isLoading) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoaded({ state: "loading" });
    if (plan === "pdf" && pdf.data === undefined) return;
    const bytes =
      plan === "pdf"
        ? Promise.resolve(pdf.data ?? null)
        : fetchFileBytes(queryClient, agentPath, filePath, bytesCacheKey);
    bytes
      .then(async (data) => {
        if (cancelled) return;
        if (data === null) {
          setLoaded({ state: "binary" });
          return;
        }
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    agentPath,
    filePath,
    bytesCacheKey,
    queryClient,
    t,
    plan,
    pdf.data,
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
