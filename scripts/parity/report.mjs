/**
 * Non-failing progress report: how far the UNENFORCED surfaces (the native apps)
 * lag the inventory. Printed on every run so mobile progress is visible in CI
 * without blocking the build. Enforced surfaces are gated by validation instead.
 */

/**
 * Build the lag table string. `manifests` are the loaded+parsed manifests;
 * `sinceById` maps component id -> since; `version` is the inventory version.
 * A component "counts as behind" for a surface if its since <= the inventory
 * version and its status is anything other than "implemented" (not-started,
 * partial, or a missing entry).
 */
export function buildReport(manifests, sinceById, version) {
  const total = sinceById.size;
  const rows = [];
  for (const m of manifests) {
    const man = m.value;
    if (!man || typeof man !== "object" || man.enforced === true) continue;
    const comps = man.components ?? {};
    let implemented = 0;
    let partial = 0;
    let notStarted = 0;
    for (const id of sinceById.keys()) {
      const status = comps[id]?.status;
      if (status === "implemented") implemented++;
      else if (status === "partial") partial++;
      else notStarted++;
    }
    const behind = total - implemented;
    rows.push({
      surface: man.surface ?? m.name,
      at: `v${man.inventoryVersion ?? "?"}`,
      spec: `v${version ?? "?"}`,
      implemented,
      partial,
      notStarted,
      behind,
    });
  }

  if (rows.length === 0) return "";

  const header = [
    "Surface",
    "At",
    "Spec",
    "Impl",
    "Partial",
    "Not-started",
    "Behind",
  ];
  const cells = rows.map((r) => [
    r.surface,
    r.at,
    r.spec,
    String(r.implemented),
    String(r.partial),
    String(r.notStarted),
    `${r.behind}/${total}`,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...cells.map((c) => c[i].length)),
  );
  const line = (c) => c.map((v, i) => v.padEnd(widths[i])).join("  ");

  const out = [
    "Unenforced surface lag (report only, non-blocking):",
    "",
    `  ${line(header)}`,
  ];
  for (const c of cells) out.push(`  ${line(c)}`);
  return out.join("\n");
}
