const GENERIC_UPDATE_NOTES = new Set([
  "See the assets to download and install this version.",
]);

export function normalizeUpdateNotes(
  body: string | null | undefined,
): string | null {
  const notes = body?.replace(/\r\n/g, "\n").trim();
  if (!notes || GENERIC_UPDATE_NOTES.has(notes)) return null;
  return notes;
}

/**
 * Marker the release pipeline appends to the updater notes to carry the
 * NON-English translations of a release's notes, e.g.
 *
 *   ## Houston 0.5.0
 *   - English notes...
 *
 *   <!--houston-i18n:{"es":"## Houston 0.5.0\n- Notas...","pt":"..."}-->
 *
 * Why a trailing HTML comment: the Tauri updater hands the frontend exactly
 * ONE string (`latest.json` -> `notes` -> `update.body`), so every language
 * has to ride inside it. A comment degrades cleanly everywhere it is NOT
 * understood: the Streamdown renderer, GitHub's release page, and any older
 * Houston build all drop HTML comments, so they just show the English body.
 * New builds strip the comment, read the JSON, and swap in the user's
 * language. The payload is built by the `prep` job in `.github/workflows/release.yml`.
 */
const I18N_MARKER = "<!--houston-i18n:";

/** Reduce a BCP-47 tag ("pt-BR") to its base ("pt") so region variants match. */
function localeBase(locale: string | null | undefined): string | null {
  if (!locale) return null;
  return locale.toLowerCase().split(/[-_]/)[0] || null;
}

interface SplitNotes {
  /** English body, shown verbatim whenever no translation applies. */
  base: string;
  /** Non-English translations keyed by base locale ("es", "pt"). */
  translations: Record<string, string>;
}

/**
 * Split a raw updater body into its English base and the optional translation
 * map carried in the trailing i18n comment. A missing or malformed marker
 * degrades to "the whole body is the base": we never throw on the notes the
 * CI produced, because there is no user action to surface and the English
 * body is always a safe fallback. This is progressive enhancement, not a
 * swallowed user-initiated error.
 */
function splitNotes(body: string): SplitNotes {
  const start = body.indexOf(I18N_MARKER);
  if (start === -1) return { base: body, translations: {} };

  const base = body.slice(0, start);
  const jsonStart = start + I18N_MARKER.length;
  const end = body.indexOf("-->", jsonStart);
  if (end === -1) return { base: body, translations: {} };

  try {
    const parsed: unknown = JSON.parse(body.slice(jsonStart, end));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { base, translations: {} };
    }
    const translations: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const loc = localeBase(key);
      if (loc && typeof value === "string") translations[loc] = value;
    }
    return { base, translations };
  } catch {
    return { base, translations: {} };
  }
}

/**
 * Resolve the release notes to show for `locale`, then normalize them. Picks
 * the user's language when the release ships a translation for it, otherwise
 * falls back to the English base. `locale` is the live UI language (i.e.
 * `i18n.language`), which already reflects the active workspace's locale
 * override, so the update card speaks the same language as the rest of the app.
 */
export function selectUpdateNotes(
  body: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  if (body == null) return null;
  const { base, translations } = splitNotes(body);
  const loc = localeBase(locale);
  const chosen = (loc && loc !== "en" && translations[loc]) || base;
  return normalizeUpdateNotes(chosen);
}
