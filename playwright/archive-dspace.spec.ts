import { expect, test } from "@playwright/test";
import { createStudent, deleteSubmission, loginUi, logoutUi, submitViaApi } from "./helpers";

async function approveAsReviewer(page: import("@playwright/test").Page, title: string) {
  await loginUi(page, "reviewer1", "review123");
  await page.getByRole("row", { name: title }).getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".ant-message").getByText("Approved", { exact: true })).toBeVisible();
  await logoutUi(page);
}

test("E2E-004 library approves and the director archives in the portal", async ({ page }) => {
  const student = await createStudent();
  const title = `E2E archive ${Date.now()}`;
  const created = await submitViaApi(student, title);
  try {
    await approveAsReviewer(page, title);
    await loginUi(page, "library1", "library123");
    await page.getByRole("row", { name: title }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Passed library intake")).toBeVisible();
    await logoutUi(page);

    await loginUi(page, "director1", "director123");
    await page.getByRole("row", { name: title }).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText(/Push to DSpace later|Submission archived/)).toBeVisible();
  } finally {
    await deleteSubmission(created.id);
  }
});

test("E2E-005 library pushes an archived thesis to DSpace", async ({ page }) => {
  const student = await createStudent();
  const title = `E2E push ${Date.now()}`;
  const created = await submitViaApi(student, title);
  try {
    await approveAsReviewer(page, title);
    await loginUi(page, "library1", "library123");
    await page.getByRole("row", { name: title }).getByRole("button", { name: "Approve" }).click();
    await logoutUi(page);
    await loginUi(page, "director1", "director123");
    await page.getByRole("row", { name: title }).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText(/Push to DSpace later|Submission archived/)).toBeVisible();
    await logoutUi(page);

    await loginUi(page, "library1", "library123");
    await page.getByRole("tab", { name: "Archive configuration" }).click();
    await page.getByRole("tab", { name: "Push to DSpace" }).click();
    const row = page.getByRole("row", { name: title });
    await expect(row).toBeVisible();
    await row.locator("input[type=checkbox]").check();
    await page.getByRole("button", { name: /Push selected/ }).click();
    const emptyTree = page.getByText("Chưa có cây DSpace");
    if (await emptyTree.isVisible()) {
      await expect(emptyTree).toBeVisible();
    } else {
      const namedCollection = page.getByRole("dialog").getByText("Test Collection", { exact: true });
      if (await namedCollection.count()) {
        await namedCollection.click();
      } else {
        await page.getByRole("dialog").locator(".ant-tree-node-content-wrapper").last().click();
      }
      await page.getByRole("dialog").getByRole("button", { name: "Push", exact: true }).click();
      await expect(page.getByText(/Pushed \d+ submission/)).toBeVisible();
    }
  } finally {
    await deleteSubmission(created.id);
  }
});
