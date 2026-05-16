import { useTranslation } from "react-i18next";
import { Button, Input, cn } from "@houston-ai/core";

interface AiAssistResultProps {
  name: string;
  onNameChange: (v: string) => void;
  instructions: string;
  onInstructionsChange: (v: string) => void;
  onContinue: () => void;
}

export function AiAssistResult({
  name,
  onNameChange,
  instructions,
  onInstructionsChange,
  onContinue,
}: AiAssistResultProps) {
  const { t } = useTranslation("shell");

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">{t("aiAssist.nameLabel")}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t("aiAssist.namePlaceholder")}
          className="rounded-xl"
        />
      </div>

      {/* Instructions */}
      <div>
        <p className="text-sm font-medium mb-1">{t("aiAssist.generatedTitle")}</p>
        <p className="text-xs text-muted-foreground mb-3">{t("aiAssist.generatedHelper")}</p>
        <section className="rounded-xl bg-secondary p-3">
          <textarea
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            rows={Math.max(10, instructions.split("\n").length + 2)}
            className={cn(
              "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
              "placeholder:text-muted-foreground/60",
              "bg-background border border-black/[0.04] rounded-lg",
              "outline-none resize-none transition-shadow duration-200",
              "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
            )}
          />
        </section>
      </div>

      <Button onClick={onContinue} className="w-full rounded-full">
        {t("aiAssist.continueButton")}
      </Button>
    </div>
  );
}
