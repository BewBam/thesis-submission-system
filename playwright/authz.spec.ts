import { expect, test } from "@playwright/test";
import { apiBase, createStudent, loginUi } from "./helpers";

test("E2E-006 a student cannot run library intake", async ({ page }) => {
  const student = await createStudent();
  await loginUi(page, student.user.username, student.password);
  await expect(page.getByText("Library intake queue")).toHaveCount(0);

  const response = await fetch(`${apiBase()}/reviews/library-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${student.token}`
    },
    body: JSON.stringify({
      submissionId: "00000000-0000-4000-8000-000000000001",
      action: "approve"
    })
  });
  expect(response.status).toBe(403);
});
