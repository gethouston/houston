import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AgentIdentityForm } from "./agent-identity-form";

interface NamingStepProps {
  formId: string;
  heading: string;
  name: string;
  color: string | undefined;
  error: string | null;
  nameInvalid?: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function NamingStep({ heading, ...identity }: NamingStepProps) {
  const { t } = useTranslation("shell");

  return (
    <div className="mx-auto w-full max-w-sm md:my-auto">
      <AgentIdentityForm
        {...identity}
        header={
          <div className="flex flex-col gap-1">
            <p className="text-balance text-2xl font-normal">{heading}</p>
            <p className="text-sm text-ink-muted">{t("naming.tagline")}</p>
          </div>
        }
      />
    </div>
  );
}
