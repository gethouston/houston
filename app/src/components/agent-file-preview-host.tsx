import { useUIStore } from "../stores/ui";
import { FilePreviewDialog } from "./file-preview-dialog";

/**
 * The single, globally mounted instance of the workspace-file preview dialog,
 * fed by `useUIStore.filePreview` (set by `useOpenAgentFile` from chat file
 * cards, turn summaries, and prose file pills). Mounted once per app tree —
 * app/src/main.tsx and packages/web/src/app-tree.tsx — so it works on every
 * screen, onboarding included. The Files tab keeps its own local instance.
 */
export function AgentFilePreviewHost() {
  const preview = useUIStore((s) => s.filePreview);
  const setFilePreview = useUIStore((s) => s.setFilePreview);
  return (
    <FilePreviewDialog
      agentPath={preview?.agentPath ?? ""}
      filePath={preview?.filePath ?? null}
      fileName={preview?.fileName ?? ""}
      onClose={() => setFilePreview(null)}
    />
  );
}
