/**
 * Truncate `value` to at most `max` RUNES — Unicode code points, not the UTF-16
 * code units a `maxLength` attribute or `String.slice` counts.
 *
 * The distinction is the whole point of the helper. A name of sixty emoji is
 * sixty runes and one hundred and twenty code units, so a UTF-16 cap of sixty
 * would silently halve a perfectly valid name, and slicing code units can cut a
 * surrogate pair down the middle and leave a lone surrogate in the field.
 * Spreading the string iterates code points, so neither can happen.
 *
 * Generic on purpose: `ui/layout` knows about a ceiling its host asked for, not
 * about whatever the host is naming.
 */
export function clampToRunes(value: string, max: number): string {
  if (!(max > 0)) return "";
  const runes = [...value];
  return runes.length <= max ? value : runes.slice(0, max).join("");
}
