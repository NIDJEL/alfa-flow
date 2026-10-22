# ALFA FLOW

**От потребности бизнеса в деньгах — к объяснимому финансированию в одном кабинете.**

Демонстрационный прототип для «Альфа Хак 2026». Не официальный продукт Альфа-Банка,
не оферта. Все компании, документы, операции, ставки, проверки и выдача — синтетические.
Реальные деньги не переводятся. Платные API, LLM и GPU не нужны.

## Запуск одной командой

Требования: Docker Desktop / Docker Engine с Compose, 8–16 ГБ RAM на машине,
свободные порты 8088, 8080 и 5434. Интернет нужен только для первоначальной загрузки образов/пакетов.

```powershell
docker compose up --build -d
```

- Кабинет: http://localhost:8088/demo
- Swagger (локальные assets, не CDN): http://localhost:8088/docs/
- OpenAPI: http://localhost:8088/api/openapi.yaml
- Readiness: http://localhost:8088/api/v1/health/ready
- PostgreSQL: localhost:5434 (для локальных integration tests).

Миграция и seed=2026 выполняются API автоматически. Повторный запуск не сбрасывает заявки.
Необязательно скопировать `.env.example` в `.env`: defaults предназначены только для локальной синтетики.
`POSTGRES_PASSWORD` меняет пароль **при создании нового** volume. Для существующего volume требуется
согласованная смена пароля внутри PostgreSQL, а не простая правка переменной.

```powershell
docker compose ps
.\scripts\smoke.ps1
```

Остановка с сохранением состояния: `docker compose stop`. Возврат: `docker compose up -d`.

**Опасно:** `docker compose down -v` удалит демонстрационную БД безвозвратно.
Для обычного повторного показа используйте безопасный явный reset синтетики через `/demo` →
«Управление демо-стендом» → checkbox → «Сбросить синтетические данные».
Reset удаляет текущие учебные заявки и сеансы; приложение предупредит об этом.

## Проверка за 7 минут

| Профиль | Сценарий | Проверяемый результат |
|---|---|---|
| A / Северный Кофе | 1 000 000 ₽, 24 мес., оборот | offer_issued → accept → sign → issued |
| B / Маркет Восток | 5 000 000 ₽, 12 мес. | counteroffer; What-if и новая версия предложения |
| C / Маяк Сервис | Заявлено 4,2 млн ₽ вместо 3 млн ₽ | needs_info → запрос банка → уточнение 3 млн ₽ → offer |
| D / Контур Демо | Ликвидируемая компания | declined; сумма/срок не обходят hard-stop |
| E / Линия Плюс | Mock БКИ недоступна | manual_review; мотивированное действие аналитика |
| F / Новый Старт | История за один месяц | needs_info; прогноз не выдумывается |

1. Начните с чистого seed через явный reset, если уже проводили тесты.
2. A: обзор → «Подобрать финансирование» → оборотный продукт → форма → демо-документ →
   проверить → согласие → отправить. Примите предложение и подпишите **в демо**.
   Обновите страницу: тот же `issued` и идентификатор симуляции.
3. B: откройте существующую заявку → «Сравнить сценарии» → меняйте сумму и срок →
   «Запросить эти условия». Версия предложения растёт, исходная сумма заявки остаётся.
4. C: клиент видит запрос. В другом browser profile / incognito войдите как аналитик,
   найдите «Маяк Сервис», запросите сведения. Клиент увидит запрос без refresh.
   Ответьте, указав оборот `3000000` ₽ → новое решение и новая snapshot revision.
   Обычные вкладки одного профиля браузера делят cookie: для двух ролей нужны независимые сессии.
5. D: откройте отрицательный исход и What-if. Допустимых альтернатив не будет.
6. Банк: очередь → карточка → проверки → «Паспорт» → «Воспроизвести решение».
7. Financial Twin: 30/60/90 дней, операции и допущения. What-if сравнивает баланс с выдачей,
   учитывая **новые платежи и существующие долги**, а не только прибавляет сумму кредита.

## Что работает

- React/TypeScript frontend: 11 продуктовых маршрутов, resumable server draft, формы и документы,
  роли, финансовый прогноз, сценарии, кредитное предложение и паспорт.
- Go JSON API + PostgreSQL: server-side RBAC/tenant isolation, CSRF, optimistic concurrency,
  idempotent submit/accept/sign, atomic status/event/audit, unique simulated disbursement.
- 20 seed-профилей/заявок; шесть месяцев транзакций (F намеренно один).
- Fixed-point деньги (int64 копейки), exact rational annuity, half-up и корректировка последнего платежа.
- Версионируемая политика, input SHA256, неизменяемые решения, исторический replay.
- Mock registry/BKI/authority/signing/disbursement явно отмечены как simulated.
- Polling 2,5–3 с, локальный Swagger, OpenAPI из Go-схем, Postman collection.
- P1 CSV import: UTF-8 validation, exact money, deterministic dedupe, старые snapshots не меняются.

## Разработка и тесты

Go 1.27.3 (автозагрузка toolchain Go), Node 24, pnpm 11.25.0. Locked dependencies: `backend/go.sum`, `web/pnpm-lock.yaml`.

```powershell
docker compose up -d postgres
cd backend
$env:DATABASE_URL="postgres://alfa_demo:local_synthetic_only@localhost:5434/alfa_flow?sslmode=disable"
$env:DEMO_MODE="true"
$env:PUBLIC_ORIGIN="http://localhost:5173"
go run ./cmd/api
# В отдельном терминале из корня:
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Все проверки:
```powershell
.\scripts\verify.ps1
```
Либо раздельно:
```powershell
cd backend
go vet ./...
$env:TEST_DATABASE_URL="postgres://alfa_demo:local_synthetic_only@localhost:5434/alfa_flow?sslmode=disable"
go test ./... -count=1 -v
go run ./cmd/contracts
cd ../web
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
$env:BASE_URL="http://localhost:8088"
pnpm test:contract
pnpm test:e2e
```

**E2E global setup намеренно сбрасывает только синтетические fixtures** через admin API.
Не запускайте E2E на стенде, чьи текущие демо-заявки нужно сохранить.
Integration tests создают отдельную случайную PostgreSQL schema, удаляют только её и не меняют
демонстрационные данные; TEST_DATABASE_URL user должен иметь CREATE SCHEMA.
Без `TEST_DATABASE_URL` integration явно SKIP, не считается прохождением.
Скриншоты: `artifacts/visual-qa/`, отчёт Playwright: `web/playwright-report/`.
Сценарии и результаты проверок: [TEST_SCENARIOS](docs/TEST_SCENARIOS.md).

Проверено: **7 E2E**, 10 Go domain tests +10 PostgreSQL integration subcases, 2 frontend unit tests,
lint/typecheck/build, OpenAPI +24 реальных ответов, smoke A→issued, новый Docker volume,
реальный API restart. npm audit и Go govulncheck: 0 известных findings. 23 скриншота, включая mobile.
Локальный benchmark GET списка: p95 23,14 ms (100 sequential, warmup20; не production SLA).

## Конфигурация и ограничения

API: `DATABASE_URL`, `API_ADDR` (default `:8080`), `DEMO_MODE` (обязательно true для demo login),
`PUBLIC_ORIGIN` (строго origin UI для CSRF; Compose `http://localhost:8088`).
`AI_ENABLED=false`: AI adapter не включён в поставку; переключение true не добавит AI.
Никакие запросы к LLM не выполняются.

Это прототип, не production banking: demo IAM позволяет выбрать любую синтетическую роль,
нет real KYC/БКИ/подписи/выдачи, документ сохраняется как проверенные метаданные и hash, не как
архив с антивирусом/OCR. Есть CSV import с UTF-8 validation/dedupe; нет SSE (реализован
корректный polling) и PDF export.
Прогноз — простой прозрачный baseline; не ML, не гарантия и не предложение выдать деньги.
Подробнее: [SECURITY](docs/SECURITY.md), [FORECAST_METHOD](docs/FORECAST_METHOD.md).

## Диагностика

- Docker pipe not found: запустите Docker Desktop и дождитесь готовности Linux Engine.
- Порт занят: остановите свой dev API на 8080; Compose API использует тот же порт.
- «Недопустимый источник»: открывайте **localhost:8088**, не 127.0.0.1:8088; либо согласованно измените PUBLIC_ORIGIN.
- Старая версия записи: обновите карточку; optimistic version защищает от одновременных действий.
- Не воспроизводится C/B: fixtures уже изменены тестами. Сделайте явный reset демо.
- `pnpm install` блокирует build scripts: используется committed `pnpm-workspace.yaml`,
  разрешены только esbuild/oxide, Scarf telemetry отключён.
- `pnpm audit`: runtime и dev дерево проверены после обновлений; подробности в [SECURITY](docs/SECURITY.md).

## Документация

[Архитектура](docs/ARCHITECTURE.md) · [Модель данных](docs/DATA_MODEL.md) ·
[Состояния](docs/STATE_MACHINE.md) · [Кредитная политика](docs/CREDIT_POLICY.md) ·
[Продуктовая логика](docs/PRODUCT_RATIONALE.md) · [Лицензии](THIRD_PARTY_NOTICES).

Доступ жюри и официальную конкурсную отправку должен подтвердить владелец репозитория.
