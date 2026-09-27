import { expect, test } from "@playwright/test";
import { createStudent, deleteSubmission, fillThesisForm, loginUi, logoutUi } from "./helpers";

test("E2E-001 student submits a valid PDF", async ({ page }) => {
  const student = await createStudent();
  let submissionId = "";
  try {
    await loginUi(page, student.user.username, student.password);
    const title = `E2E submit ${Date.now()}`;
    await fillThesisForm(page, title);
    await page.getByRole("button", { name: "Submit thesis" }).click();
    await expect(page.getByText("Thesis submitted successfully")).toBeVisible();
    await expect(page.getByText("Reviewing")).toBeVisible();
    await logoutUi(page);
  } finally {
    const list = await fetch(`${process.env.API_URL || "http://127.0.0.1:3001"}/submissions/student/${student.user.id}`, {
      headers: { Authorization: `Bearer ${student.token}` }
    });
    const rows = await list.json();
    submissionId = Array.isArray(rows) ? rows[0]?.id : "";
    if (submissionId) {
      await deleteSubmission(submissionId);
    }
  }
});

test("E2E-002 student cannot submit without a PDF", async ({ page }) => {
  const student = await createStudent();
  await loginUi(page, student.user.username, student.password);
  await fillThesisForm(page, `E2E missing pdf ${Date.now()}`, { pdf: false });
  await page.getByRole("button", { name: "Submit thesis" }).click();
  await expect(page.getByText("Please upload thesis PDF")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});
