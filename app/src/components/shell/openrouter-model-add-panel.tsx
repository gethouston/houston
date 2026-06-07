import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@houston-ai/core";
import type { OpenRouterCatalogModel } from "@houston-ai/engine-client";
import { isOpenRouterModelSlug } from "../../lib/openrouter-models";
import { modelSupportsAgenticTools } from "../../lib/providers";

interface Props {
  filtered: OpenRouterCatalogModel[];
  query: string;
  onQueryChange: (value: string) => void;
  onAddModel: (id: string) => void;
  onAddRecommended: (kind: "free" | "paid") => void;
}

export function OpenRouterModelAddPanel({
  filtered,
  query,
  onQueryChange,
  onAddModel,
  onAddRecommended,
}: Props) {
  const { t } = useTranslation("providers");
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSlug, setManualSlug] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const handleManualAdd = () => {
    const slug = manualSlug.trim();
    if (!isOpenRouterModelSlug(slug)) {
      setManualError(t("openrouterConnect.pasteModelInvalid"));
      return;
    }
    onAddModel(slug);
    setManualSlug("");
    setManualError(null);
    setManualOpen(false);
  };

  if (!searchOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setSearchOpen(true)}
        className="gap-1.5 rounded-full"
      >
        <Plus className="size-3.5" />
        {t("openrouterConnect.addModel")}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Command shouldFilter={false} className="rounded-xl border border-black/5">
        <CommandInput
          value={query}
          onValueChange={onQueryChange}
          placeholder={t("openrouterConnect.searchPlaceholder")}
        />
        <CommandList className="max-h-36">
          <CommandEmpty>{t("openrouterConnect.noModelResults")}</CommandEmpty>
          {filtered.map((m) => (
            <CommandItem key={m.id} value={m.id} onSelect={() => onAddModel(m.id)}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {m.name}{" "}
                <span className="text-muted-foreground">
                  {m.isFree
                    ? t("openrouterConnect.searchPricingFree")
                    : t("openrouterConnect.searchPricingPaid")}{" "}
                  {modelSupportsAgenticTools("openrouter", m.id)
                    ? t("openrouterConnect.searchModeAgent")
                    : t("openrouterConnect.searchModeChat")}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        <button
          type="button"
          onClick={() => onAddRecommended("free")}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("openrouterConnect.addFreeSuggested")}
        </button>
        <button
          type="button"
          onClick={() => onAddRecommended("paid")}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("openrouterConnect.addPaidSuggested")}
        </button>
      </div>
      {!manualOpen ? (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("openrouterConnect.pasteModelLink")}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <input
              type="text"
              value={manualSlug}
              onChange={(ev) => {
                setManualSlug(ev.target.value);
                setManualError(null);
              }}
              placeholder={t("openrouterConnect.pasteModelPlaceholder")}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="button" size="sm" variant="outline" onClick={handleManualAdd}>
              {t("openrouterConnect.pasteModelAdd")}
            </Button>
          </div>
          {manualError ? (
            <p className="text-[12px] text-destructive" role="alert">
              {manualError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
