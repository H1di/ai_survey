const { test, expect } = require("@playwright/test");

test("keyless user reaches a roadmap", async ({ page, request }) => {
  // Guard: a real key leaking in from backend/.env would make this run spend
  // money and stop proving the keyless path.
  const health = await (await request.get("/api/health")).json();
  expect(health.hasOpenAIKey).toBe(false);

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
  // Bounded click: after the last answer the chosen card is disabled and then
  // unmounts, and an unbounded click on it would wait out the whole test while
  // the hierarchy screen is already up. A miss just re-checks for that screen.
  while (!(await confirm.isVisible())) {
    await left.click({ timeout: 1_000 }).catch(() => {});
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
  // The scene may hand over by itself (reduced motion) or offer the button;
  // wait for whichever comes instead of sitting out a timeout on the button.
  const seePath = page.getByRole("button", { name: /see your path/i });
  const accept = page.getByRole("button", { name: /Yes — accept this path/ });
  await expect(seePath.or(accept).first()).toBeVisible({ timeout: 30_000 });
  if (await seePath.isVisible()) await seePath.click({ timeout: 2_000 }).catch(() => {});
  await expect(accept).toBeVisible({ timeout: 30_000 });

  // The concrete job column carries the O*NET profession title.
  const jobBody = page
    .locator(".output-column", { hasText: "concrete job" })
    .locator(".output-body");
  await expect(jobBody).toHaveText(/\S+/);

  // Accept -> the roadmap path renders in the graph, a marker per stage.
  await accept.click();
  await expect(page.locator(".rp-marker").first()).toBeVisible({ timeout: 30_000 });

  // The O*NET attribution rides in the output's details panel. The camera
  // frames the roadmap path alone, so bring the output card back into view
  // the way a user would: the graph's fit-view control.
  await page.getByRole("button", { name: /fit view/i }).click();
  await page.locator(".node--output").click();
  await expect(page.getByText(/This product includes information from the O\*NET/)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
