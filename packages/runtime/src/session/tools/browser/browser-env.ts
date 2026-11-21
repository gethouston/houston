type Env = Record<string, string | undefined>;

const KEPT = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LANGUAGE",
  "TZ",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "COMMONPROGRAMFILES",
  "PATHEXT",
  "COMSPEC",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
]);
const KEPT_PREFIXES = ["LC_", "FONTCONFIG_", "XDG_"];

export function browserEnv(env: Env): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (KEPT.has(upper) || KEPT_PREFIXES.some((p) => upper.startsWith(p)))
      kept[name] = value;
  }
  return kept;
}
