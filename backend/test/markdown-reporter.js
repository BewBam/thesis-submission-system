const fs = require("fs");
const path = require("path");

class MarkdownReporter {
  onRunComplete(_contexts, results) {
    const kind = reportKind(results);
    const output = path.join(__dirname, "..", "..", "docs", "test-output", `${kind.file}.md`);
    const target = kind.target || process.env.API_URL || "local (thesis_test)";
    const rows = [];
    for (const suite of results.testResults) {
      const file = path.basename(suite.testFilePath);
      for (const test of suite.testResults) {
        rows.push({
          file,
          title: test.title,
          status: test.status,
          durationMs: test.duration || 0,
          error: (test.failureMessages || []).join("\n\n")
        });
      }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderReport(kind.title, target, results, rows), "utf8");
    console.log(`Test report: ${output}`);
  }
}

function reportKind(results) {
  const files = results.testResults.map((suite) => suite.testFilePath);
  const only = (name) => files.length > 0 && files.every((file) => file.includes(name));
  if (only("mail.e2e-spec")) {
    return { file: "email-report", title: "Email integration test" };
  }
  if (only("dspace-live.e2e-spec")) {
    return {
      file: "dspace-report",
      title: "DSpace live publish",
      target: "local (thesis_test) → http://dspace.lib.test"
    };
  }
  return { file: "api-report", title: "API test" };
}

function renderReport(title, target, results, rows) {
  const failed = rows.filter((row) => row.status === "failed");
  const lines = [
    `# ${title}`,
    "",
    `- Thời điểm: ${new Date().toISOString()}`,
    `- Đích: ${target}`,
    `- Tổng: ${results.numTotalTests}`,
    `- Passed: ${results.numPassedTests}`,
    `- Failed: ${results.numFailedTests}`,
    `- Skipped: ${results.numPendingTests}`,
    "",
    "| File | Test | Kết quả | Thời gian |",
    "|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.file)} | ${escapeCell(row.title)} | ${row.status} | ${row.durationMs} ms |`
    ),
    ""
  ];
  if (failed.length) {
    lines.push("## Lỗi", "");
    for (const row of failed) {
      lines.push(`### ${row.title}`, "", "```", row.error.trim(), "```", "");
    }
  }
  return lines.join("\n");
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

module.exports = MarkdownReporter;
