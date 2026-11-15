const { test, expect } = require("@playwright/test");

test("keyless user reaches a roadmap", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto("/");

  // Entry
  await page.getByPlaceholder("Write your honest answer").fill("I would build tools that help people learn.");
  await page.getByRole("button", { name: "Start the assessment" }).click();

  // Journey intro card
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // Demographics: first option of the single-choice question, then text/number inputs
  await page.getByRole("group", { name: "What is your sex?" }).getByText("Female", { exact: true }).click();
  const textInputs = page.locator("input.demo-input");
  const n = await textInputs.count();
  for (let i = 0; i < n; i++) {
    const input = textInputs.nth(i);
    const type = await input.getAttribute("type");
    await input.fill(type === "number" ? "30" : "Testland");
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Big Five: 20 items, always the middle option
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: "Neither" }).click();
  }

  // RIASEC: 12 items
  for (let i = 0; i < 12; i++) {
    await page.getByRole("button", { name: "Maybe" }).click();
  }
  // RIASEC result screen (a view over step `values`)
  await page.getByRole("button", { name: "Continue to values" }).click();

  // Values tournament: left card until the hierarchy screen appears
  const confirm = page.getByRole("button", { name: "Confirm hierarchy" });
  const left = page.locator(".split-half").first();
  while (!(await confirm.isVisible())) {
    if (await left.isVisible()) await left.click();
    else await page.waitForTimeout(50);
  }
  await confirm.click();

  // CV: pick the no-CV path, answer seven journey questions
  await page.getByRole("radio", { name: "Something completely new" }).click();
  const journey = page.locator("form input.demo-input");
  for (let i = 0; i < 7; i++) {
    await journey.fill(`Journey answer ${i + 1}`);
    await page.getByRole("button", { name: /^(Next|Finish)/ }).click();
  }

  // Summary -> first output (the funnel scene hands over via "See your path")
  await page.getByRole("button", { name: "Enter the Life Path Engine" }).click();
  await page.getByRole("button", { name: /see your path/i }).click({ timeout: 30_000 }).catch(() => {});

  const accept = page.getByRole("button", { name: /Yes — accept this path/ });
  await expect(accept).toBeVisible({ timeout: 30_000 });

  // The concrete job column carries the O*NET profession title.
  const jobBody = page
    .locator(".output-column", { hasText: "concrete job" })
    .locator(".output-body");
  await expect(jobBody).toHaveText(/\S+/);

  // Accept -> roadmap nodes render in the graph.
  await accept.click();
  await expect(page.locator(".node--roadmap").first()).toBeVisible({ timeout: 30_000 });

  // The O*NET attribution rides in the output's details panel.
  await page.locator(".node--output").click();
  await expect(page.getByText(/This product includes information from the O\*NET/)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
