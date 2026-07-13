import { CatalogTile } from "@houston-ai/core";
import { skillMonogram } from "@houston-ai/skills";

/**
 * One installed skill in the consolidated strip: the shared {@link CatalogTile}
 * carrying the skill's image, or a monogram box when it has none (the same
 * fallback rule the old installed rows used). Clicking opens the edit modal —
 * the skill's one detail surface (delete lives in its footer).
 */
export function InstalledSkillTile({
  displayName,
  imageUrl,
  onOpen,
}: {
  displayName: string;
  imageUrl: string | null;
  onOpen: () => void;
}) {
  return (
    <CatalogTile label={displayName} onClick={onOpen}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-12 rounded-xl object-cover"
        />
      ) : (
        <span className="grid size-12 place-items-center rounded-xl bg-chip font-semibold text-ink-muted">
          {skillMonogram(displayName)}
        </span>
      )}
    </CatalogTile>
  );
}
