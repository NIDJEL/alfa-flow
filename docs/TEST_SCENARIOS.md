# Матрица приёмки / фактический прогон

## Проверка перед публикацией и установка — 23 октября 2026

- Изолированный Compose-проект `alfa-flow-qa`, новый PostgreSQL volume, web на
  `localhost:18089`: **11 E2E passed / 35,7 с**. Основной volume не сбрасывался.
- Проверены desktop 1440×900 / 1280×800 и mobile 390×844; сравнение What-if,
  черновик, помощь, клавиатура, баланс, клиентский и банковский путь.
- `go vet ./...` и Go-тесты с `TEST_DATABASE_URL`: PASS, включая 10 PostgreSQL
  integration-подсценариев. Frontend lint/typecheck, **6 unit tests**, build: PASS.
- OpenAPI: 30 путей, 24 реальных ответа: PASS. `pnpm audit`: известных findings нет.
- Реальный Windows bootstrap через PowerShell 5.1: все три контейнера healthy,
  API ready. При повторе совпали SHA-256 `.env` и fingerprint ID/версий всех заявок.
- Контрактные тесты установщика: PowerShell 5.1 и 7, shell через Git Bash и Linux
  Alpine-контейнер без сети: PASS. Проверены private-архив, путь с пробелами,
  сохранение `.env`, ошибка сборки, отказ работать с посторонним каталогом.
- Отдельно проверена фактическая загрузка private-архива GitHub API с доступом
  текущего пользователя; токен не сохраняется в checkout.
- Все **10 Mermaid-блоков** README/архитектуры/данных/состояний распарсены и
  отрендерены в Chromium. Изображения проверки остаются в ignored `artifacts/doc-qa/`.
- Автоустановка Docker на чистых macOS/Windows не выполнялась: её системные шаги,
  UAC/WSL, условия Docker и возможная перезагрузка явно описаны в `INSTALL.md`.

## Повторный аудит и продуктовая доводка — 23 октября 2026

Полный прогон после переработки карточки баланса на пересобранном Docker/Nginx
(`BASE_URL=http://localhost:8088`): **11 E2E passed / 35,2 с**.
Полный Vite-прогон той же версии: **11 passed / 48,9 с**.

- Go vet и 10 domain-групп +10 PostgreSQL integration-подсценариев: PASS.
- Frontend lint/typecheck/build и **6 unit tests**: PASS.
- OpenAPI: 30 путей, **24 реальных ответа**: PASS.
- Docker web image пересобран; postgres/api/web healthy. Smoke A → issued: PASS.
- `pnpm audit`: No known vulnerabilities found. Это проверка известных зависимостных
  проблем, не полный pentest; govulncheck повторно в этой доработке не запускался.
- Новые E2E: сравнение двух серверных сценариев без изменения версии/предложений;
  возобновление черновика оборудования после reload и игнорирование ошибочного product query;
  помощь, focus restore, mobile menu/Escape, reduced motion, контекст запроса.
- Axe: нет serious/critical на проверенных overview/insights/passport/queue,
  What-if comparison и help. Не заявляем полное WCAG-соответствие всего продукта.
- Новые снимки: `24-scenario-comparison.png`, `25-in-product-help.png`,
  `26-next-action-mobile.png`; основные 01–23 обновлены тем же Docker-прогоном.
  Desktop 1440×900 / 1280×800 и mobile 390×844 проверены.
- Карточка баланса переработана и отдельно проверена в `balance.spec.ts`:
  данные совпадают с API, скрытие/показ работает клавиатурой, ссылка ведёт в Financial Twin,
  Axe на компоненте проходит, overflow не появляется на 1440/1280/390.

Исправлены: dev origin mismatch без изменения backend policy, потеря product при
resume, отсутствие draft ID в URL после первого сохранения, временно нечитаемый
fade текста, неверные generic company labels, дробный срок симулятора,
межтестовая зависимость accessibility spec.

Ниже — историческая матрица предыдущего прогона; её дата и числа не означают,
что все прежние внешние security/clean-launch проверки повторялись в новой доработке.

Дата фактического прогона: **22 октября 2026**, Москва. Данные synthetic seed=2026.
`PASS` ниже означает команду, реально выполненную в текущем workspace, а не ожидаемый результат.

| Case | Шаги | Ожидание | Факт | Evidence | Result |
|---|---|---|---|---|---|
| Unit finance | `cd backend; go test ./...` | annuity 0/normal/last payment, aggregation, forecast, CSV/refund | 10 domain test groups passed | `artifacts/go-tests.txt` | PASS |
| A API | Go integration: A submit/accept/sign/reopen | one issued + one disbursement | passed against PostgreSQL | `backend/internal/httpapi/integration_test.go` | PASS |
| B API | counteroffer + simulation + revised offer | alternatives use same policy, simulation side-effect-free | passed | integration test | PASS |
| C API | bank request → client provide-info | needs_info → new revision → offer | passed | integration test | PASS |
| D API | declined + what-if min amount | hard-stop no alternatives / no issue | passed | integration test | PASS |
| E API | unavailable BKI + bank decide | manual_review then motivated offer | passed | integration test | PASS |
| G API | duplicate idempotency and concurrent submit | one effect, no duplicate disbursement | passed | integration test | PASS |
| H API | company A GET company B application | 403 | passed | integration test | PASS |
| I/J API | stored snapshot replay + changed current policy | replay match, historical hash unchanged | passed | domain/integration test | PASS |
| Contract | `pnpm test:contract` | OpenAPI validates; real endpoint responses match schema | 30 routes / 24 real responses | stdout / `api/openapi.yaml` | PASS |
| E2E A | Playwright client: form error → document → submit → accept → sign → reload | issued persists | passed, 4.0 s | `artifacts/visual-qa/01…08` | PASS |
| E2E B | Playwright What-if + new offer revision | payment changes, version 2 | passed, 2.6 s | `09-what-if` | PASS |
| E2E C | Two browser contexts client/bank, polling, provide-info, replay | status sync and matching passport | passed, 5.3 s | `10…12` | PASS |
| E2E D | declined What-if | no bypass action | passed, 2.0 s | `13-declined` | PASS |
| Visual desktop | 1440×900, 1280×800 client/bank | hierarchy, Cyrillic, charts, table | passed | `01`, `14`, `19`, `20` | PASS |
| Visual mobile | 390×844 client/bank | no horizontal overflow | passed | `16`, `17`, `18`, `21` | PASS |
| Browser errors | Playwright `pageerror`, all five specs | no console page errors | passed | E2E assertions | PASS |
| Security | malformed JSON, CSRF, path traversal upload, forged role, rollback | 4xx / no mutation | passed | integration test | PASS |
| Docker | `docker compose up --build -d` | postgres healthy, API/web images build and containers start | passed | Docker output / `docker compose ps` | PASS |
| CSV import | unit + integration + browser upload twice | exact kopeks, dedupe 1→0, snapshot unchanged | passed | `quality.spec.ts`, CSV test | PASS |
| DB rollback | SQL trigger intentionally fails after application update | no partial state/event commit | passed | `DB_failure_mid_transition_rolls_back_all` | PASS |
| Immutable evidence | UPDATE decision_runs | DB trigger rejects | passed | integration test | PASS |
| Actual restart | restart API container after issued | same session, status, disbursement ID | passed | status log | PASS |
| Clean DB | `scripts/clean-launch.ps1` | new volume auto-migrate/seed + A issued | passed | `artifacts/clean-launch.txt` | PASS |
| Full final | `scripts/verify.ps1` | lint/typecheck/unit/integration/build/audit/E2E/smoke | exit 0 | `artifacts/verify-final.txt` | PASS |
| Accessibility | Axe WCAG2/2.1 A/AA overview/finance/passport/queue | no serious/critical | passed; warning badge contrast fixed | quality E2E | PASS |
| Collection | exported Postman A folder executed | login→create→submit→accept→sign→issued | passed | collection-smoke | PASS |

Последний полный Docker E2E: **7 passed / 22,4 с**. Полная проверка `verify.ps1`: exit 0.
Go: 10 domain tests +10 integration subcases. Frontend: 2 unit tests. Скриншотов: 23.
Benchmark: p50 15,26 ms, p95 23,14 ms, max 24,50 ms по 100 sequential GET /applications
после 20 warmup, Windows local Docker Desktop/Nginx, синтетическая БД. Это не SLA.

## Visual QA notes

Исправлены P0/P1, обнаруженные running-product проверкой:
- dev `PUBLIC_ORIGIN` не совпадал с Vite origin → добавлено корректное origin и тест;
- React Query сохранял профиль/заявки после switch persona → login удаляет tenant query cache;
- dev login page делал лишний `/me` запрос до выбора роли → query disabled на `/demo`;
- график при нулевом сценарии показывал фантомную вторую линию → скрыта без server delta;
- ось показывала копейки как «35 млн» → масштаб откорректирован на ₽;
- график и screenshot могли быть устаревшими из-за анимации → `isAnimationActive=false`;
- small financial labels были слишком мелкими → базовая типографика поднята, mobile overrides сохранены;
- forecast терял расходы и existing debt при совпадающей дате → expenses aggregate по дню до median.

## Оговорки

`pnpm audit` runtime/dev после обновлений: **0 известных findings**. Непатченный braces
удалён обновлением TypeScript ESLint. `govulncheck` после Go 1.27.3 / pgx 5.9.2 / x/text 0.41.0:
**No vulnerabilities found**.

Миграция/seed намеренно автоматизированы для демо и не являются production migration runner.
SSE заменён polling с reconnect через React Query. Upload сохраняет hash/metadata, не blob.
CSV import добавлен и проверен unit/integration, historical replay не меняется. PDF export/AI/OCR
не добавлены. Публичное размещение и GitHub
access жюри не выполнялись: remote отсутствует, пользователь должен проверить перед сдачей.
