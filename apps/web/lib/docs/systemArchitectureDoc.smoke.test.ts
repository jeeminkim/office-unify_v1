import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/** Vitest cwd is `apps/web`; repo docs live at `<repo>/docs`. */
const DOC_PATH = join(process.cwd(), "..", "..", "docs", "SYSTEM_ARCHITECTURE.md");

describe("docs/SYSTEM_ARCHITECTURE.md smoke", () => {
  it("starts with the canonical H1 title", () => {
    const raw = readFileSync(DOC_PATH, "utf8");
    const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    expect(firstLine.trim()).toBe("# System Architecture (Personal Investment Console)");
  });

  it("keeps Dashboard Today Candidates as a subsection, not a top-level ## before main structure", () => {
    const raw = readFileSync(DOC_PATH, "utf8");
    expect(raw.includes("### Dashboard Today Candidates")).toBe(true);
    expect(raw.includes("\n## Dashboard Today Candidates\n")).toBe(false);
    const idxMain = raw.indexOf("## 메인 화면 구조");
    const idxDash = raw.indexOf("### Dashboard Today Candidates");
    expect(idxMain >= 0).toBe(true);
    expect(idxDash > idxMain).toBe(true);
  });
});
