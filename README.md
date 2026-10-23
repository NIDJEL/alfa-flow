# ALFA FLOW

**От потребности бизнеса в деньгах — к объяснимому финансированию в одном кабинете.**

ALFA FLOW — демонстрационный прототип умного кредитного кабинета для «Альфа Хак 2026».
Предприниматель создаёт заявку, загружает подтверждения, видит прозрачный результат и
проходит путь до демо-выдачи. Аналитик банка работает с очередью, запросами сведений,
решением и историей проверки.

> **Важно:** это не официальный продукт Альфа-Банка и не оферта. Компании, документы,
> ставки, проверки, счета и выдача синтетические. Реальные деньги не переводятся.
> Платные API, LLM и GPU не нужны.

## Содержание

- [Запуск за одну команду](#запуск-за-одну-команду)
- [Что поднимается](#что-поднимается)
- [Как пройти демо](#как-пройти-демо)
- [Как читать диаграммы](#как-читать-диаграммы)
- [Разработка и проверки](#разработка-и-проверки)
- [Конфигурация и ограничения](#конфигурация-и-ограничения)
- [Диагностика](#диагностика)
- [Документация](#документация)

## Запуск за одну команду

Для демонстрации нужен только **Docker Desktop** (Windows/macOS) или **Docker Engine +
Compose v2** (Linux). Go, Node.js, pnpm и PostgreSQL устанавливать не нужно: они собираются
в контейнерах. На первом запуске потребуется интернет и примерно 8–16 ГБ свободной RAM.

### Если репозиторий уже клонирован

**Windows PowerShell:**

```powershell
.\scripts\install.cmd
```

или:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

**macOS / Linux:**

```sh
sh ./scripts/install.sh
```

Скрипт проверит Docker, при необходимости создаст локальный `.env` из `.env.example`,
соберёт контейнеры, дождётся readiness API и откроет кабинет. По умолчанию данные
сохраняются в volume `postgres_data`.

### Клонирование и запуск одной вставкой

**Windows PowerShell:**

```powershell
git clone https://github.com/NIDJEL/alfa-flow.git; Set-Location alfa-flow; .\scripts\install.cmd
```

**macOS / Linux:**

```sh
git clone https://github.com/NIDJEL/alfa-flow.git && cd alfa-flow && sh ./scripts/install.sh
```

Для запуска без ручного клонирования:

**Windows PowerShell:**

```powershell
irm https://raw.githubusercontent.com/NIDJEL/alfa-flow/main/scripts/install.ps1 | iex
```

**macOS / Linux:**

```sh
curl -fsSL https://raw.githubusercontent.com/NIDJEL/alfa-flow/main/scripts/install.sh | sh
```

> Скрипты автоматически устанавливают Docker только если это возможно безопасно:
> Windows — через `winget`, macOS — через Homebrew или официальный `.dmg`, Linux —
> официальным `get.docker.com`.
> Если пакетный менеджер недоступен, скрипт остановится и подскажет, что установить вручную.

### Адреса после запуска

| Что открыть | Адрес |
|---|---|
| Кабинет предпринимателя / демо-вход | [localhost:8088/demo](http://localhost:8088/demo) |
| Swagger UI | [localhost:8088/docs/](http://localhost:8088/docs/) |
| OpenAPI | [localhost:8088/api/openapi.yaml](http://localhost:8088/api/openapi.yaml) |
| Readiness API | [localhost:8088/api/v1/health/ready](http://localhost:8088/api/v1/health/ready) |

Проверка после запуска:

```sh
docker compose ps
```

Smoke-проверка полного сценария A → `issued`:

```sh
# macOS / Linux
sh ./scripts/smoke.sh

# Windows PowerShell
.\scripts\smoke.ps1
```

Остановить без удаления данных:

```sh
docker compose stop
```

Продолжить позже:

```sh
docker compose up -d
```

> **Не используйте `docker compose down -v` для обычной остановки:** команда удалит
> демонстрационную PostgreSQL БД. Для сброса синтетики используйте экран
> `/demo` → «Управление демо-стендом» → «Сбросить синтетические данные».

## Что поднимается

```mermaid
flowchart LR
    U["Браузер<br/>предприниматель или аналитик"] -->|HTTP :8088| WEB["web<br/>Nginx + React"]
    WEB -->|"/api/*"| API["api<br/>Go HTTP"]
    API -->|SQL :5432| DB[("postgres<br/>volume")]
    API -->|миграции + seed=2026| DB

    classDef user fill:#fff4f2,stroke:#d62f2f,color:#1f1f1f
    classDef app fill:#f7f7f5,stroke:#262626,color:#1f1f1f
    classDef data fill:#f1f5f9,stroke:#334155,color:#1f1f1f
    class U user
    class WEB,API app
    class DB data
```

| Сервис | Роль | Порт на компьютере |
|---|---|---:|
| `web` | React-интерфейс и reverse proxy `/api` | `8088` |
| `api` | Workflow, policy, RBAC, audit, OpenAPI | `8080` |
| `postgres` | состояние заявок и immutable evidence | `5434` |

В браузере используется только `http://localhost:8088`: это важно для CSRF-проверки
демо-сессии. API и PostgreSQL опубликованы на loopback только для локальной диагностики.

## Как пройти демо

### Быстрый маршрут A — от заявки до выдачи

1. Откройте [кабинет](http://localhost:8088/demo) и выберите **Северный Кофе**.
2. Нажмите «Подобрать финансирование» → оборотный продукт.
3. Заполните 1 000 000 ₽ на 24 месяца, добавьте демо-документ и отправьте заявку.
4. Примите предложение и подтвердите **демо-подписание**.
5. Убедитесь, что статус стал `issued`, а идентификатор симуляции сохранился после обновления.

### Остальные учебные профили

| Профиль | Что проверить | Ожидаемый результат |
|---|---|---|
| A / Северный Кофе | 1 000 000 ₽, 24 мес., оборот | `offer_issued` → `issued` |
| B / Маркет Восток | 5 000 000 ₽, 12 мес. | counteroffer и новая версия предложения |
| C / Маяк Сервис | заявлено 4,2 млн вместо 3 млн ₽ | `needs_info` → уточнение → offer |
| D / Контур Демо | ликвидируемая компания | `declined`, hard-stop не обходится |
| E / Линия Плюс | недоступен mock-БКИ | `manual_review` и решение аналитика |
| F / Новый Старт | история только за один месяц | `needs_info`, прогноз не выдумывается |

Для сценария C откройте второй профиль браузера или приватное окно и войдите как аналитик:
обычные вкладки одного профиля делят cookie и не дают воспроизвести двух участников.

## Как читать диаграммы

В документации используются три схемы. Чтобы не смешивать разные уровни:

1. **Архитектура** показывает, как браузер, контейнеры и слои Go общаются между собой.
2. **Модель данных** показывает, где живет заявка и какие immutable evidence-таблицы
   сохраняют объяснение решения.
3. **Машина состояний** показывает допустимый путь заявки; `offer_issued` — это готовые
   условия, `offer_accepted` — согласие клиента, а `issued` — финал демо-цепочки.

Подробные версии с легендами и пояснениями:

- [Архитектура](docs/ARCHITECTURE.md)
- [Модель данных](docs/DATA_MODEL.md)
- [Машина состояний](docs/STATE_MACHINE.md)
- [Кредитная политика](docs/CREDIT_POLICY.md)
- [Метод прогноза](docs/FORECAST_METHOD.md)
- [Операционный runbook](docs/RUNBOOK.md)

## Разработка и проверки

### Локальный dev-режим без web-контейнера

В production-подобном Docker-запуске команды не нужны. Для разработки можно поднять
PostgreSQL, API и Vite отдельно:

```powershell
docker compose up -d postgres
cd backend
$env:DATABASE_URL="postgres://alfa_demo:local_synthetic_only@localhost:5434/alfa_flow?sslmode=disable"
$env:DEMO_MODE="true"
$env:PUBLIC_ORIGIN="http://localhost:5173"
go run ./cmd/api
```

Во втором терминале:

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Полный набор проверок:

```powershell
.\scripts\verify.ps1
```

Или отдельно:

```powershell
cd backend
go vet ./...
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

E2E-тесты сбрасывают только синтетические fixtures через dev-only admin API.
Не запускайте их на стенде, где нужно сохранить текущие демо-заявки.

## Конфигурация и ограничения

Compose использует безопасные локальные значения из `.env.example`:

- `POSTGRES_PASSWORD` — пароль локальной демонстрационной БД;
- `DEMO_MODE=true` — вход через синтетические персоны;
- `AI_ENABLED=false` — AI/LLM в поставку не включён.

У проекта нет real KYC, реального БКИ, электронной подписи или выдачи денег. Документ
сохраняется как проверенные метаданные и hash, а не как production-архив с OCR и антивирусом.
CSV импорт проверяет UTF-8 и дубликаты. Обновления статуса читаются polling; SSE нет.
Прогноз — прозрачный baseline, не ML и не обещание выдачи кредита.

## Диагностика

- **Docker pipe not found** — запустите Docker Desktop и дождитесь Linux Engine.
- **Порт занят** — освободите `8088`, `8080` или `5434`.
- **«Недопустимый источник»** — открывайте `http://localhost:8088`, а не `127.0.0.1:8088`.
- **`409 CONFLICT`** — перечитайте заявку: сработала optimistic version или повторный ключ.
- **Нужно посмотреть логи:**

  ```sh
  docker compose logs api --tail=100
  docker compose logs web --tail=100
  docker compose exec postgres pg_isready -U alfa_demo -d alfa_flow
  ```

## Документация

[API](docs/API.md) · [Архитектура](docs/ARCHITECTURE.md) · [Данные](docs/DATA_MODEL.md) ·
[Состояния](docs/STATE_MACHINE.md) · [Политика](docs/CREDIT_POLICY.md) ·
[Безопасность](docs/SECURITY.md) · [Лицензии](THIRD_PARTY_NOTICES)

Проверено 23 октября 2026 года в локальном Docker Compose. Это демонстрационный прототип,
а не production banking-система.
