import { expect, test } from "@playwright/test";
import { createStudent, deleteSubmission, loginUi, logoutUi, submitViaApi } from "./helpers";

test("E2E-003 reviewer rejects and the student submits again", async ({ page }) => {
  const student = await createStudent();
  const title = `E2E reject ${Date.now()}`;
  const created = await submitViaApi(student, title);
  try {
    await loginUi(page, "reviewer1", "review123");
    const row = page.getByRole("row", { name: title });
    await row.getByRole("button", { name: "Reject" }).click();
    await page.getByRole("dialog").locator("textarea").fill("Please revise the abstract");
    await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
    await expect(page.locator(".ant-message").getByText("Rejected", { exact: true })).toBeVisible();
    await logoutUi(page);

    await loginUi(page, student.user.username, student.password);
    await expect(page.getByText("rejected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Submit again" }).click();
    await expect(page.getByText("Thesis updated and submitted for review")).toBeVisible();
    await logoutUi(page);

    await loginUi(page, "reviewer1", "review123");
    await expect(page.getByRole("row", { name: title })).toBeVisible();
    await expect(page.getByText("Need My Review")).toBeVisible();
  } finally {
    await deleteSubmission(created.id);
  }
});
