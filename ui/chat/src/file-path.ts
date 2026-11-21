export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

export function extensionOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function labelExtensionSuffix(path: string, label: string): string {
  const ext = extensionOf(path);
  if (!ext) return "";
  return label.toLowerCase().endsWith(`.${ext}`) ? "" : `.${ext}`;
}
