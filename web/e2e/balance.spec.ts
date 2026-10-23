import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Баланс: данные API, скрытие, переход, контраст и три размера экрана", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await page.getByRole("button", { name: /ООО «Северный Кофе»/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  const cashflow = await (
    await page.request.get("/api/v1/companies/me/cashflow")
  ).json();
  const formatted = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(cashflow.opening_balance_kopeks / 100);
  const card = page.getByRole("region", { name: "Доступно на счетах" });
  await expect(card.locator(".balance-number")).toHaveText(formatted);
  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await expect(card).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await card.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(false);
    await card.screenshot({
      path: `../artifacts/visual-qa/balance-card-${width}.png`,
    });
  }
  await card.getByRole("button", { name: "Скрыть баланс" }).focus();
  await page.keyboard.press("Enter");
  await expect(card.getByText("Баланс скрыт")).toBeAttached();
  await expect(card.locator(".balance-number")).not.toContainText(formatted);
  await expect(
    card.getByRole("button", { name: "Показать баланс" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(card.locator(".balance-number")).toHaveText(formatted);
  const report = await new AxeBuilder({ page })
    .include(".balance-card")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(report.violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await card.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await card.getByRole("link", { name: "Движение денег" }).click();
  await expect(page).toHaveURL(/\/app\/insights$/);
  await expect(
    page.getByRole("heading", { name: "Ваш денежный горизонт" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
