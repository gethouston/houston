/**
 * The shared `.houstonagent` file itself: its preview, the optional threat
 * scan, and which of its skills / routines / learnings come along.
 *
 * Everything downstream (the name suggestion, the picker steps, the install)
 * reads the preview, so nothing else in the flow parses the package.
 */

import type {
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "@houston/engine-adapter";
import { useCallback, useState } from "react";
import { getEngine } from "../../lib/engine";
import { osOpenPortableAgent } from "../../lib/os-bridge";

export interface ImportSelection {
  skillSlugs: Set<string>;
  routineIds: Set<string>;
  learningIds: Set<string>;
}

const emptySelection = (): ImportSelection => ({
  skillSlugs: new Set(),
  routineIds: new Set(),
  learningIds: new Set(),
});

export function useImportPackage(options: {
  onPreview: (preview: PortableUploadPreviewResponse) => void;
  onError: (err: unknown) => void;
}) {
  const { onPreview, onError } = options;
  const [uploaded, setUploaded] =
    useState<PortableUploadPreviewResponse | null>(null);
  const [wantScan, setWantScan] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<PortableScanResponse | null>(null);
  const [selection, setSelection] = useState<ImportSelection>(emptySelection);

  const pickFile = useCallback(async () => {
    try {
      const bytes = await osOpenPortableAgent();
      if (!bytes) return;
      const u8 = new Uint8Array(bytes);
      const result = await getEngine().importPreview(u8.buffer);
      setUploaded(result);
      // Everything arrives selected: the user unchecks what they don't want.
      setSelection({
        skillSlugs: new Set(result.preview.skills.map((s) => s.slug)),
        routineIds: new Set(result.preview.routines.map((r) => r.id)),
        learningIds: new Set(result.preview.learnings.map((l) => l.id)),
      });
      onPreview(result);
    } catch (err) {
      onError(err);
    }
  }, [onError, onPreview]);

  const chooseScan = useCallback(
    async (yes: boolean) => {
      setWantScan(yes);
      if (!yes || !uploaded || scan) return;
      setScanning(true);
      try {
        setScan(await getEngine().importScan(uploaded.packageId));
      } finally {
        setScanning(false);
      }
    },
    [scan, uploaded],
  );

  const findingsForId = useCallback(
    (kind: string, id: string) =>
      scan?.items.filter((i) => i.kind === kind && i.id === id) ?? [],
    [scan],
  );

  const resetPackage = useCallback(() => {
    setUploaded(null);
    setScan(null);
    setWantScan(null);
    setSelection(emptySelection());
  }, []);

  return {
    uploaded,
    wantScan,
    scanning,
    scan,
    selection,
    setSelection,
    pickFile,
    chooseScan,
    findingsForId,
    resetPackage,
  };
}
