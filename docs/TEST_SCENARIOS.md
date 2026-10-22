# Матрица приёмки / фактический прогон

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
