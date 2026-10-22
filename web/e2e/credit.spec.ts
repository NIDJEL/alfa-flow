import { test, expect, type Page } from "@playwright/test";
const artifacts = "../artifacts/visual-qa";
async function login(page: Page, name: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name, exact: false }).click();
  await expect(page).toHaveURL(/\/(app|bank)$/);
}
async function shot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
}
async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}
test("A: полный путь, валидация, сохранение и выдача", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "ООО «Северный Кофе»");
  await expect(
    page.getByRole("heading", { name: "Больше возможностей для роста" }),
  ).toBeVisible();
  await shot(page, "01-client-dashboard-1440");
  await page
    .getByRole("link", { name: "Подобрать финансирование" })
    .first()
    .click();
  await shot(page, "02-product-selector");
  await page.getByRole("link", { name: "Оформить заявку" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Сколько нужно бизнесу?" }),
  ).toBeVisible();
  await shot(page, "03-wizard-new");
  await page.getByLabel("Сумма кредита, ₽").fill("0");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByText("Введите сумму больше нуля")).toBeVisible();
  await shot(page, "04-wizard-error");
  await page.getByLabel("Сумма кредита, ₽").fill("1000000");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Данные вашей компании" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Прикрепить демо-документ" }).click();
  await expect(
    page.getByRole("button", { name: "Демо-документ прикреплён" }),
  ).toBeVisible();
  await shot(page, "05-wizard-filled");
  await page.getByRole("button", { name: "Проверить заявку" }).click();
  await page
    .getByLabel("Подтверждаю корректность демо-данных и отправку на проверку")
    .check();
  await shot(page, "06-wizard-review");
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(
    page.getByText("Бизнесу — ресурсы для следующего шага."),
  ).toBeVisible();
  await shot(page, "07-offer");
  await page
    .getByLabel("Принимаю демонстрационные условия предложения")
    .check();
  await page.getByRole("button", { name: "Принять предложение" }).click();
  await expect(
    page.getByRole("button", { name: "Подписать в демо" }),
  ).toBeVisible();
  await page
    .getByLabel(
      "Подтверждаю имитацию подписания. Реальные деньги не переводятся.",
    )
    .check();
  await page.getByRole("button", { name: "Подписать в демо" }).click();
  await expect(
    page.getByRole("heading", { name: "Финансирование смоделировано" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Финансирование смоделировано" }),
  ).toBeVisible();
  await shot(page, "08-issued-reloaded");
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test("B: встречное предложение и серверный What-if", async ({ page }) => {
  await login(page, "ИП «Маркет Восток»");
  await page.getByRole("link", { name: "Открыть заявку", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Та же цель. Более комфортная нагрузка.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Сравнить сценарии" }).click();
  await expect(
    page.getByRole("heading", { name: "А если изменить условия?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Запросить эти условия" }),
  ).toBeVisible();
  const before = await page.locator(".scenario-payment strong").textContent();
  await page.getByLabel("Сумма, ₽", { exact: true }).fill("500000");
  await expect
    .poll(() => page.locator(".scenario-payment strong").textContent())
    .not.toBe(before);
  await shot(page, "09-what-if");
  await page.getByRole("button", { name: "Запросить эти условия" }).click();
  await expect(page.getByText("Версия 2", { exact: true })).toBeVisible();
});
test("C: две сессии, запрос банка и уточнение клиента", async ({ browser }) => {
  const customer = await browser.newContext();
  const bank = await browser.newContext();
  const p = await customer.newPage();
  const b = await bank.newPage();
  await login(p, "ООО «Маяк Сервис»");
  await p.getByRole("link", { name: "Открыть заявку", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Немного деталей — и продолжим" }),
  ).toBeVisible();
  const id = p.url().split("/").at(-1)!;
  await login(b, "Войти как аналитик банка");
  await b.goto("/bank/applications/" + id);
  await b
    .getByLabel("Запрос клиенту")
    .fill("Уточните оборот по синтетической выписке за шесть месяцев.");
  await b
    .getByRole("button", { name: "Запросить сведения", exact: true })
    .click();
  await expect(
    p
      .getByText("Уточните оборот по синтетической выписке за шесть месяцев.", {
        exact: true,
      })
      .first(),
  ).toBeVisible({ timeout: 15000 });
  await shot(b, "10-bank-request-info");
  await shot(p, "11-client-needs-info");
  await p
    .getByLabel("Ответ на запрос")
    .fill("Исправлен оборот: три миллиона рублей согласно демо-выписке.");
  await p.getByLabel("Уточнённый месячный оборот, ₽").fill("3000000");
  await p.getByLabel("Подтверждаю корректность уточнённых демо-данных").check();
  await p.getByRole("button", { name: "Отправить уточнение" }).click();
  await expect(
    p.getByRole("heading", { name: "Бизнесу — ресурсы для следующего шага." }),
  ).toBeVisible();
  await expect(
    b.getByRole("heading", { name: "Бизнесу — ресурсы для следующего шага." }),
  ).toBeVisible({ timeout: 15000 });
  await b.getByRole("link", { name: "Паспорт", exact: true }).click();
  await b.getByRole("button", { name: "Воспроизвести решение" }).click();
  await expect(b.getByText("Результат совпал", { exact: true })).toBeVisible();
  await shot(b, "12-bank-passport-replay");
  await customer.close();
  await bank.close();
});
test("D: отрицательный исход без обхода hard-stop", async ({ page }) => {
  await login(page, "ООО «Контур Демо»");
  const response = await page.request.get("/api/v1/applications");
  const applications = await response.json();
  const declined = applications.find(
    (a: { status: string }) => a.status === "declined",
  );
  await page.goto("/app/applications/" + declined.id);
  await expect(
    page.getByRole("heading", {
      name: "Сейчас не можем предложить финансирование",
    }),
  ).toBeVisible();
  await shot(page, "13-declined");
  await page.getByRole("link", { name: "Что, если?", exact: false }).click();
  await page.getByLabel("Сумма, ₽", { exact: true }).fill("100000");
  await expect(
    page.getByText("Недопустимый сценарий", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Запросить эти условия" }),
  ).toHaveCount(0);
});
test("QA: 1280, 390, finance, bank queue, паспорт клиента", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "ООО «Северный Кофе»");
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot(page, "14-dashboard-1280");
  await noOverflow(page);
  await page.goto("/app/insights");
  await expect(
    page.getByRole("heading", { name: "Ваш денежный горизонт" }),
  ).toBeVisible();
  await shot(page, "15-financial-twin");
  await page.getByRole("button", { name: "Показать операции" }).click();
  await expect(page.getByText("Синтетическая выручка").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Больше возможностей для роста" }),
  ).toBeVisible();
  await noOverflow(page);
  await shot(page, "16-dashboard-mobile");
  await page.goto("/app/financing");
  await expect(
    page.getByRole("heading", { name: "Деньги под вашу задачу" }),
  ).toBeVisible();
  await noOverflow(page);
  await shot(page, "17-products-mobile");
  await page.goto("/app/insights");
  await noOverflow(page);
  await shot(page, "18-twin-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "Войти как аналитик банка");
  await expect(
    page.getByRole("heading", { name: "Очередь заявок", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".queue-table tbody tr").first()).toBeVisible({
    timeout: 15000,
  });
  await shot(page, "19-bank-queue");
  await page.getByLabel("Фильтр по статусу").selectOption("manual_review");
  await expect(
    page
      .locator(".queue-table .badge")
      .getByText("Рассмотрение в банке", { exact: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Рассмотреть", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Продолжить рассмотрение" }),
  ).toBeVisible();
  await shot(page, "20-bank-manual-review");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await shot(page, "21-bank-mobile");
  expect(errors).toEqual([]);
});
