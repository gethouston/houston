import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";

import { useIssueIdentity } from "../../../hooks/queries/use-identity";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DOC_OPTIONS = [
  { value: "", labelKey: "identity.verify.documentNone" },
  { value: "passport", labelKey: "identity.verify.documentPassport" },
  { value: "drivers_license", labelKey: "identity.verify.documentDriversLicense" },
  { value: "national_id", labelKey: "identity.verify.documentNationalId" },
  { value: "residence_permit", labelKey: "identity.verify.documentResidencePermit" },
] as const;

/**
 * Identity self-attestation modal — maps the Figma "Verify Your Identity"
 * screen onto an issueIdentity mutation. Required fields: nationality,
 * DOB. Optional: ID document type + country (unlocks idv_verified). All
 * fields tagged self_attested per Beltic schema.
 */
export function VerifyIdentityDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("settings");
  const issue = useIssueIdentity();

  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [docType, setDocType] = useState("");
  const [docCountry, setDocCountry] = useState("");
  const [declarationOk, setDeclarationOk] = useState(false);

  const canSubmit =
    declarationOk &&
    nationality.trim() &&
    dob.trim() &&
    (!docType || docCountry);

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await issue.mutateAsync({
        nationality: nationality.trim(),
        date_of_birth: dob.trim(),
        id_document_type: docType || undefined,
        id_document_country: docCountry || undefined,
        self_attestation_complete: true,
      });
      onOpenChange(false);
      setNationality("");
      setDob("");
      setDocType("");
      setDocCountry("");
      setDeclarationOk(false);
    } catch {
      // showErrorToast fired inside the mutation's onError
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("identity.verify.title")}</DialogTitle>
          <DialogDescription>{t("identity.verify.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <LabeledText
            label={t("identity.verify.nationality")}
            value={nationality}
            onChange={setNationality}
            placeholder="ISO-3166-1 alpha-2 (e.g. US, BR)"
            maxLength={2}
            required
          />
          <LabeledText
            label={t("identity.verify.dob")}
            value={dob}
            onChange={setDob}
            placeholder="YYYY-MM-DD"
            required
          />

          <div className="space-y-1">
            <label className="text-sm font-medium block">
              {t("identity.verify.documentType")}
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 h-9 text-sm"
            >
              {DOC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("identity.verify.documentTypeOptional")}
            </p>
          </div>

          {docType ? (
            <LabeledText
              label={t("identity.verify.documentCountry")}
              value={docCountry}
              onChange={setDocCountry}
              placeholder="ISO-3166-1 alpha-2 (e.g. US)"
              maxLength={2}
              required
            />
          ) : null}

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
            {issue.isPending ? t("identity.verify.issuing") : t("identity.verify.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledText({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-md border border-gray-300 px-2 h-9"
      />
    </label>
  );
}
