import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("P1 CSV: безопасный импорт, дубликаты и доступность основных экранов", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "ООО «Северный Кофе»", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Больше возможностей для роста" }),
  ).toBeVisible();
  const scan = async () => {
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      report.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
  };
  await scan();
  await page.goto("/app/insights");
  await expect(
    page.getByRole("heading", { name: "Дополните финансовую историю" }),
  ).toBeVisible();
  const csv =
    "date,amount,currency,direction,category,description\n2026-09-10,123.45,RUB,credit,sales,Учебная CSV операция\n";
  await page.getByLabel("Импортировать CSV").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByText(
      "Добавлено: 1; повторов пропущено: 0. Исторические решения не изменены.",
    ),
  ).toBeVisible();
  await page.getByLabel("Импортировать CSV").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByText(
      "Добавлено: 0; повторов пропущено: 1. Исторические решения не изменены.",
    ),
  ).toBeVisible();
  await scan();
  const appsResponse = await page.request.get("/api/v1/applications");
  const applications = await appsResponse.json();
  let issued = applications.find(
    (a: { decisions: unknown[] }) => a.decisions.length > 0,
  );
  // The accessibility spec must also run in isolation, not depend on credit.spec.
  if (!issued) {
    const { csrf_token } = await (await page.request.get("/api/v1/me")).json();
    const draft = applications.find(
      (a: { status: string }) => a.status === "draft",
    );
    const result = await page.request.post(
      `/api/v1/applications/${draft.id}/submit`,
      {
        headers: { "X-CSRF-Token": csrf_token },
        data: { version: draft.version, consent: true },
      },
    );
    expect(result.ok()).toBeTruthy();
    issued = await result.json();
  }
  expect(issued).toBeTruthy();
  await page.goto("/app/applications/" + issued.id);
  await page
    .getByRole("link", { name: "Паспорт решения", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "У каждого решения есть основание" }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/visual-qa/22-client-passport.png",
    fullPage: true,
  });
  await scan();
  await page.goto("/demo");
  await page.getByRole("button", { name: "Войти как аналитик банка" }).click();
  await expect(
    page.getByRole("heading", { name: "Очередь заявок", exact: true }),
  ).toBeVisible();
  await scan();
  expect(errors).toEqual([]);
});
test("Wizard resume и responsive 390×844", async ({ page }) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "ООО «Северный Кофе»", exact: false })
    .click();
  await page.goto("/app/applications/new");
  await page.getByLabel("Сумма кредита, ₽").fill("1200000");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(
    page.getByRole("heading", { name: "Ваш черновик ждёт продолжения" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Продолжить оформление" }).click();
  await expect(page.getByLabel("Сумма кредита, ₽")).toHaveValue("1200000");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "../artifacts/visual-qa/23-wizard-mobile.png",
    fullPage: true,
  });
});
