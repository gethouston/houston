import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  FilePreviewError,
  type OfficeExtension,
} from "@houston/wire-types/file-preview";

export function conversionLocale(lang: string): string {
  switch (lang.toLowerCase().split("-")[0]) {
    case "es":
      return "es_ES.UTF-8";
    case "pt":
      return "pt_BR.UTF-8";
    default:
      return "en_US.UTF-8";
  }
}

export function pdfFilter(ext: OfficeExtension): string {
  if (["pptx", "ppt", "odp"].includes(ext)) {
    return 'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}';
  }
  if (["xlsx", "xls", "ods"].includes(ext)) {
    return 'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}';
  }
  return "pdf";
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
      throw error;
  }
}

export function runOffice(
  args: string[],
  cwd: string,
  lang: string,
  timeoutMs = 30_000,
  executable = "soffice",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const locale = conversionLocale(lang);
    const child = spawn(executable, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: cwd,
        TMPDIR: cwd,
        LANG: locale,
        LC_ALL: locale,
      },
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      killGroup(child.pid);
      if (timedOut)
        reject(new FilePreviewError("timeout", "Office conversion timed out"));
      else if (code !== 0)
        reject(
          new FilePreviewError("conversion_failed", "Office conversion failed"),
        );
      else resolve();
    });
  });
}

export interface ConvertedPdf {
  pdf: Buffer;
  pageCount: number;
}
export async function convert(
  source: Buffer,
  ext: OfficeExtension,
  lang: string,
): Promise<ConvertedPdf> {
  const work = await mkdtemp(join(tmpdir(), "houston-office-"));
  try {
    const input = join(work, `source.${ext}`);
    await writeFile(input, source);
    await runOffice(
      [
        `-env:UserInstallation=${pathToFileURL(join(work, "profile")).href}`,
        "--headless",
        "--convert-to",
        pdfFilter(ext),
        "--outdir",
        work,
        input,
      ],
      work,
      lang,
    );
    const output = join(work, "source.pdf");
    const pdf = await readFile(output);
    const { stdout } = await promisify(execFile)("pdfinfo", [output], {
      timeout: 5_000,
    });
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    if (
      !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      !Number.isInteger(pageCount) ||
      pageCount < 1
    ) {
      throw new FilePreviewError(
        "conversion_failed",
        "Converter did not produce a valid PDF",
      );
    }
    return { pdf, pageCount };
  } catch (error) {
    if (error instanceof FilePreviewError) throw error;
    throw new FilePreviewError(
      "conversion_failed",
      `Converter did not produce a PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
