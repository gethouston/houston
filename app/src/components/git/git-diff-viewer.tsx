/**
 * `<GitDiffViewer />` — render a raw unified diff string with simple
 * +/- coloring. Headers (`diff --git`, `index`, `---`, `+++`, `@@`) get
 * a muted color so the actual changes stand out.
 *
 * Phase 3 of RFC #248 (`advanced.git_panel`). Read-only. v2 may parse
 * into hunks for inline-comment / blame integration.
 */
import { useTranslation } from "react-i18next";

interface Props {
  diff: string;
}

export function GitDiffViewer({ diff }: Props) {
  const { t } = useTranslation("git");
  if (!diff.trim()) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        {t("diff.noChanges")}
      </div>
    );
  }
  const lines = diff.split("\n");
  return (
    <pre className="text-xs leading-relaxed font-mono whitespace-pre overflow-x-auto">
      {lines.map((line, idx) => (
        <div key={idx} className={lineClass(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function lineClass(line: string): string {
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename ")
  ) {
    return "text-muted-foreground/70";
  }
  if (line.startsWith("@@")) return "text-blue-500";
  if (line.startsWith("+")) return "text-green-500 bg-green-500/5";
  if (line.startsWith("-")) return "text-red-500 bg-red-500/5";
  return "";
}
