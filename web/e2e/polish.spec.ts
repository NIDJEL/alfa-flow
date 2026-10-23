import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, name: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name, exact: false }).click();
  await expect(page).toHaveURL(/\/app$/);
}
async function scan(page: Page) {
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    report.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
}
test("Сравнение What-if: два серверных снимка без изменения заявки", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "ИП «Маркет Восток»");
  const list = await (await page.request.get("/api/v1/applications")).json();
  const id = list.find(
    (a: { status: string }) => a.status === "offer_issued",
  ).id;
  const before = await (
    await page.request.get("/api/v1/applications/" + id)
  ).json();
  await page.goto(`/app/applications/${id}/what-if`);
  await page.getByRole("button", { name: "Закрепить текущий вариант" }).click();
  await expect(
    page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: /Вариант 1/ }) }),
  ).toBeVisible();
  await page.getByLabel("Сумма, ₽", { exact: true }).fill("600000");
  await page.getByRole("button", { name: "Закрепить текущий вариант" }).click();
  const comparison = page.getByRole("region", { name: "Сравнение сценариев" });
  await expect(
    comparison.getByRole("columnheader", { name: /Вариант 2/ }),
  ).toBeVisible();
  await expect(
    comparison
      .getByRole("cell")
      .filter({ hasText: /600\s*000/ })
      .first(),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/visual-qa/24-scenario-comparison.png",
    fullPage: true,
  });
  await scan(page);
  const after = await (
    await page.request.get("/api/v1/applications/" + id)
  ).json();
  expect(after.version).toBe(before.version);
  expect(after.offers).toEqual(before.offers);
  await comparison.getByRole("button", { name: "Убрать вариант 1" }).click();
  await expect(
    comparison.getByRole("columnheader", { name: /Вариант 2/ }),
  ).toHaveCount(0);
  await page.getByLabel("Срок, месяцев", { exact: true }).fill("12.5");
  await expect(
    page.getByRole("button", { name: "Запросить эти условия" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("Черновик оборудования: правильный продукт, обновление и серверное сохранение шага", async ({
  page,
}) => {
  await login(page, "ООО «Северный Кофе»");
  await page.goto("/app/applications/new?product=EQUIPMENT_LOAN");
  await page.getByLabel("Сумма кредита, ₽").fill("1600000");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Данные вашей компании" }),
  ).toBeVisible();
  const url = new URL(page.url());
  const id = url.searchParams.get("draft")!;
  expect(id).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel("Сумма кредита, ₽")).toHaveValue("1600000");
  await expect(
    page
      .locator(".wizard")
      .getByText("Кредит на оборудование · гипотетические условия"),
  ).toBeVisible();
  await page.goto(
    `/app/applications/new?draft=${id}&product=WORKING_CAPITAL_LOAN`,
  );
  await expect(
    page
      .locator(".wizard")
      .getByText("Кредит на оборудование · гипотетические условия"),
  ).toBeVisible();
  await page.getByLabel("Сумма кредита, ₽").fill("1700000");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(
    page.getByRole("heading", { name: "Ваш черновик ждёт продолжения" }),
  ).toBeVisible();
  const application = await (
    await page.request.get(`/api/v1/applications/${id}`)
  ).json();
  expect(application.params.product_id).toBe("EQUIPMENT_LOAN");
  expect(application.params.amount_kopeks).toBe(170000000);
});
test("Помощь, mobile-menu, reduced motion и понятный следующий шаг", async ({
  page,
}) => {
  await login(page, "ИП «Новый Старт»");
  await expect(page.locator(".company-switch")).toContainText("Новый Старт");
  await expect(
    page.getByRole("link", { name: "Ответить на запрос" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Как это работает" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByText("Что здесь реально, а что смоделировано?", { exact: true })
    .click();
  await scan(page);
  await page.screenshot({
    path: "../artifacts/visual-qa/25-in-product-help.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Как это работает" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".mobile-menu")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Открыть меню" }),
  ).toBeFocused();
  expect(
    await page
      .locator(".growth-card")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Как это работает" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть помощь" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "../artifacts/visual-qa/26-next-action-mobile.png",
    fullPage: true,
  });
});
