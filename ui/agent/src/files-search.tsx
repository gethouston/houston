import { CatalogSearchField } from "@houston-ai/core";

export function FilesSearch({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  return (
    <div className="w-full max-w-md min-w-0">
      <CatalogSearchField
        value={value}
        onChange={onChange}
        label={placeholder}
        clearLabel={clearLabel}
      />
    </div>
  );
}
