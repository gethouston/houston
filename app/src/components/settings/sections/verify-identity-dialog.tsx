import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@houston-ai/core";
import { Upload, X, FileText } from "lucide-react";

import { useIssueIdentity } from "../../../hooks/queries/use-identity";
import { useUIStore } from "../../../stores/ui";
import { getEngine } from "../../../lib/engine";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DOC_OPTIONS = [
  { value: "passport", labelKey: "identity.verify.documentPassport" },
  { value: "drivers_license", labelKey: "identity.verify.documentDriversLicense" },
  { value: "national_id", labelKey: "identity.verify.documentNationalId" },
  { value: "residence_permit", labelKey: "identity.verify.documentResidencePermit" },
] as const;

type DocType = (typeof DOC_OPTIONS)[number]["value"];

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 10 * 1024 * 1024;

interface Attachment {
  id: string;
  /** Held to POST bytes to the engine on submit; cleared after submit. */
  file: File;
  filename: string;
  contentType: string;
  sizeBytes: number;
  docType: DocType;
  sha256?: string;
  /** Set after the engine successfully forwards the bytes to Beltic. */
  belticEvidenceId?: string;
  error?: string;
}

export function VerifyIdentityDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("settings");
  const issue = useIssueIdentity();
  const addToast = useUIStore((s) => s.addToast);

  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [declarationOk, setDeclarationOk] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  /**
   * Pre-selected document type for the next dropped file. User can change
   * this between drops to upload different doc types in one session. The
   * per-row dropdown stays as a safety net for fixing wrong types after
   * the fact without removing + re-uploading.
   */
  const [pendingDocType, setPendingDocType] = useState<DocType>("passport");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const anyHashing = attachments.some((a) => !a.sha256 && !a.error);
  const canSubmit =
    declarationOk &&
    nationality.trim().length === 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dob.trim()) &&
    !anyHashing;

  function reset() {
    setNationality("");
    setDob("");
    setDeclarationOk(false);
    setAttachments([]);
    setIsDragging(false);
    setPendingDocType("passport");
  }

  async function hashAttachment(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function ingestFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        addToast({
          title: t("identity.verify.evidence.unsupportedType", {
            name: file.name,
          }),
          variant: "error",
        });
        continue;
      }
      if (file.size > MAX_BYTES) {
        addToast({
          title: t("identity.verify.evidence.fileTooLarge", {
            name: file.name,
          }),
          variant: "error",
        });
        continue;
      }
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      if (attachments.some((a) => a.id === id)) continue;
      const next: Attachment = {
        id,
        file,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        // Pick up the currently-selected pre-type. User can adjust
        // per-row after the fact via the row's dropdown.
        docType: pendingDocType,
      };
      setAttachments((cur) => [...cur, next]);
      try {
        const sha = await hashAttachment(file);
        setAttachments((cur) =>
          cur.map((a) => (a.id === id ? { ...a, sha256: sha } : a)),
        );
      } catch (err) {
        setAttachments((cur) =>
          cur.map((a) =>
            a.id === id
              ? { ...a, error: err instanceof Error ? err.message : "hash failed" }
              : a,
          ),
        );
      }
    }
  }

  /**
   * Prefer `evidence:<id>` (Beltic resource) when the engine
   * successfully forwarded the upload; fall back to the opaque
   * `sha256:<hex>:<doctype>:<urlencoded-filename>` shape when Beltic
   * wasn't reachable. Beltic stores both formats verbatim today;
   * `evidence:<id>` is what triggers the W3C `evidence[]` embedding
   * in the JWT-VC at issue time.
   */
  function buildEvidenceRefs(persisted: Attachment[]): string[] {
    return persisted
      .filter((a) => a.sha256)
      .map((a) =>
        a.belticEvidenceId
          ? `evidence:${a.belticEvidenceId}`
          : `sha256:${a.sha256}:${a.docType}:${encodeURIComponent(a.filename)}`,
      );
  }

  async function onSubmit() {
    if (!canSubmit) return;
    const primaryDocType = attachments.find((a) => a.sha256)?.docType;
    const engine = getEngine();
    // Persist each attachment locally BEFORE issuing the credential.
    // Aborting the issuance on any persist failure avoids the situation
    // where the credential names evidence files that aren't on disk.
    // The engine ALSO forwards bytes to Beltic when reachable — when it
    // succeeds, we get back `beltic_evidence_id` to use as the canonical
    // ref. When it fails (staging hasn't deployed PR #179), we fall back
    // to the opaque `sha256:<hex>:...` shape; the credential row still
    // carries the ref and re-running once Beltic is live is a no-op
    // (sha256 dedupes upstream).
    try {
      const persisted: Attachment[] = [];
      for (const a of attachments) {
        if (!a.sha256) continue;
        const bytes = new Uint8Array(await a.file.arrayBuffer());
        const result = await engine.persistIdentityEvidence(bytes, {
          sha256: a.sha256,
          contentType: a.contentType,
          documentType: a.docType,
          filename: a.filename,
        });
        persisted.push({
          ...a,
          ...(result.beltic_evidence_id
            ? { belticEvidenceId: result.beltic_evidence_id }
            : {}),
        });
      }
      await issue.mutateAsync({
        nationality: nationality.trim().toUpperCase(),
        date_of_birth: dob.trim(),
        ...(primaryDocType ? { id_document_type: primaryDocType } : {}),
        ...(primaryDocType
          ? { id_document_country: nationality.trim().toUpperCase() }
          : {}),
        self_attestation_complete: true,
        evidence_refs: buildEvidenceRefs(persisted),
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      addToast({
        title: t("identity.verify.evidence.persistFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("identity.verify.title")}</DialogTitle>
          <DialogDescription>
            {t("identity.verify.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("identity.verify.nationality")}
              required
              hint={t("identity.verify.nationalityHint")}
            >
              <Input
                value={nationality}
                onChange={(e) =>
                  setNationality(e.target.value.toUpperCase().slice(0, 2))
                }
                placeholder="US"
                maxLength={2}
                autoCapitalize="characters"
              />
            </Field>
            <Field
              label={t("identity.verify.dob")}
              required
              hint={t("identity.verify.dobHint")}
            >
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium">
                {t("identity.verify.evidence.title")}
              </label>
              <span className="text-xs text-muted-foreground">
                {t("identity.verify.evidence.optional")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("identity.verify.evidence.description")}
            </p>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                {t("identity.verify.evidence.nextDocType")}
              </label>
              <Select
                value={pendingDocType}
                onValueChange={(v) => setPendingDocType(v as DocType)}
              >
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files.length > 0) {
                  void ingestFiles(e.dataTransfer.files);
                }
              }}
              className={`w-full rounded-lg border-2 border-dashed px-4 py-6 text-sm flex flex-col items-center gap-2 transition-colors cursor-pointer ${
                isDragging
                  ? "border-foreground/40 bg-muted/60"
                  : "border-border hover:border-foreground/20 hover:bg-muted/30"
              }`}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">
                {t("identity.verify.evidence.dropPrompt")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("identity.verify.evidence.tagAs", {
                  type: t(
                    `identity.verify.document${capitalize(pendingDocType)}` as Parameters<typeof t>[0],
                  ),
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("identity.verify.evidence.constraints")}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void ingestFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
            </button>

            {attachments.length > 0 && (
              <ul className="space-y-2 pt-1">
                {attachments.map((a) => (
                  <AttachmentRow
                    key={a.id}
                    attachment={a}
                    onChangeDocType={(docType) =>
                      setAttachments((cur) =>
                        cur.map((x) => (x.id === a.id ? { ...x, docType } : x)),
                      )
                    }
                    onRemove={() =>
                      setAttachments((cur) => cur.filter((x) => x.id !== a.id))
                    }
                    t={t}
                  />
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={declarationOk}
              onChange={(e) => setDeclarationOk(e.target.checked)}
              className="mt-1"
            />
            <span>{t("identity.verify.declaration")}</span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={issue.isPending}
          >
            {t("identity.verify.cancel")}
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={!canSubmit || issue.isPending}
          >
            {issue.isPending
              ? t("identity.verify.issuing")
              : t("identity.verify.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentRow({
  attachment: a,
  onChangeDocType,
  onRemove,
  t,
}: {
  attachment: Attachment;
  onChangeDocType: (v: DocType) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const short = a.sha256 ? a.sha256.slice(0, 8) : null;
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center gap-3">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{a.filename}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{formatBytes(a.sizeBytes)}</span>
          {a.error ? (
            <Badge variant="destructive" className="text-[10px]">
              {a.error}
            </Badge>
          ) : short ? (
            <code className="font-mono">sha256:{short}…</code>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Spinner className="h-3 w-3" />
              {t("identity.verify.evidence.hashing")}
            </span>
          )}
        </div>
      </div>
      <Select
        value={a.docType}
        onValueChange={(v) => onChangeDocType(v as DocType)}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOC_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey as Parameters<typeof t>[0])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("identity.verify.evidence.removeAria")}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join("");
}
