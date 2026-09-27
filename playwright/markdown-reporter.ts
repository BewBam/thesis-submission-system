import fs from "fs";
import path from "path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type Row = {
  title: string;
  status: string;
  durationMs: number;
  error?: string;
};

export default class MarkdownReporter implements Reporter {
  private readonly rows = new Map<string, Row>();

  onTestEnd(test: TestCase, result: TestResult) {
    const error = result.errors
      .map((item) => item.message || item.stack || "")
      .filter(Boolean)
      .join("\n\n");
    this.rows.set(test.id, {
      title: test.titlePath().slice(1).join(" > "),
      status: result.status,
      durationMs: result.duration,
      error: error || undefined
    });
  }

  onEnd() {
    const output = path.join(process.cwd(), "docs", "test-output", "playwright-report.md");
    const list = [...this.rows.values()];
    const passed = list.filter((row) => row.status === "passed").length;
    const failed = list.filter((row) => row.status === "failed" || row.status === "timedOut");
    const skipped = list.filter((row) => row.status === "skipped").length;
    const target = process.env.PORTAL_URL || "local (http://127.0.0.1:5174)";
    const lines = [
      "# Playwright",
      "",
      `- Thời điểm: ${new Date().toISOString()}`,
      `- Đích: ${target}`,
      `- Tổng: ${list.length}`,
      `- Passed: ${passed}`,
      `- Failed: ${failed.length}`,
      `- Skipped: ${skipped}`,
      "",
      "| Test | Kết quả | Thời gian |",
      "|---|---|---|",
      ...list.map(
        (row) => `| ${escapeCell(row.title)} | ${row.status} | ${row.durationMs} ms |`
      ),
      ""
    ];
    if (failed.length) {
      lines.push("## Lỗi", "");
      for (const row of failed) {
        lines.push(`### ${row.title}`, "", "```", (row.error || "").trim(), "```", "");
      }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, lines.join("\n"), "utf8");
    console.log(`Playwright report: ${output}`);
  }
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
