import JSZip from "jszip";

/**
 * Structural artifact validators. Deterministic and offline: a pptx/xlsx is a
 * zip with a known skeleton, a png has a magic header. "Pass" means a user
 * could download the file and open it in PowerPoint/Excel/a browser — the
 * floor the canonical demos stand on.
 */
export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const check = (name: string, pass: boolean, detail?: string): Check => ({
  name,
  pass,
  detail,
});

async function openZip(bytes: Uint8Array): Promise<JSZip | null> {
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    return null;
  }
}

export async function validatePptx(
  bytes: Uint8Array,
  opts: { minSlides: number },
): Promise<Check[]> {
  const checks: Check[] = [
    check("non-empty", bytes.length > 0, `${bytes.length} bytes`),
  ];
  const zip = await openZip(bytes);
  checks.push(check("valid zip container", zip !== null));
  if (!zip) return checks;
  checks.push(
    check(
      "[Content_Types].xml present",
      zip.file("[Content_Types].xml") !== null,
    ),
  );
  checks.push(
    check(
      "ppt/presentation.xml present",
      zip.file("ppt/presentation.xml") !== null,
    ),
  );
  const slides = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  checks.push(
    check(
      `at least ${opts.minSlides} slides`,
      slides.length >= opts.minSlides,
      `${slides.length} slides`,
    ),
  );
  return checks;
}

export async function validateXlsx(bytes: Uint8Array): Promise<Check[]> {
  const checks: Check[] = [
    check("non-empty", bytes.length > 0, `${bytes.length} bytes`),
  ];
  const zip = await openZip(bytes);
  checks.push(check("valid zip container", zip !== null));
  if (!zip) return checks;
  checks.push(
    check(
      "[Content_Types].xml present",
      zip.file("[Content_Types].xml") !== null,
    ),
  );
  checks.push(
    check("xl/workbook.xml present", zip.file("xl/workbook.xml") !== null),
  );
  const sheets = Object.keys(zip.files).filter((f) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(f),
  );
  checks.push(
    check(
      "at least 1 worksheet",
      sheets.length >= 1,
      `${sheets.length} worksheets`,
    ),
  );
  if (sheets[0]) {
    const sheetFile = zip.file(sheets[0]);
    if (sheetFile) {
      const xml = await sheetFile.async("string");
      const rows = (xml.match(/<row[ >]/g) ?? []).length;
      checks.push(check("worksheet has data rows", rows >= 2, `${rows} rows`));
    }
  }
  return checks;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function validatePng(
  bytes: Uint8Array,
  opts: { minBytes: number },
): Promise<Check[]> {
  return [
    check("non-empty", bytes.length > 0, `${bytes.length} bytes`),
    check(
      "PNG magic header",
      PNG_MAGIC.every((b, i) => bytes[i] === b),
    ),
    check(
      `at least ${opts.minBytes} bytes (a real chart, not a stub)`,
      bytes.length >= opts.minBytes,
      `${bytes.length} bytes`,
    ),
  ];
}
