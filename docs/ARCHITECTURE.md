# Архитектура

ALFA FLOW — модульный монолит: React/TypeScript/Vite на web-слое, Go HTTP API и
PostgreSQL. В демонстрационном запуске это три контейнера Compose. Отдельные Kafka,
Redis, очереди и микросервисы не нужны: одна заявка изменяется синхронно в одной
транзакции, а UI получает новые статусы polling-запросами.

## Схема компонентов

```mermaid
flowchart TB
    subgraph USERS["Пользователи"]
        CLIENT(["Предприниматель"])
        BANK(["Аналитик банка"])
    end

    subgraph RUNTIME["Docker Compose"]
        WEB["web<br/>Nginx + React<br/>localhost:8088"]
        API["api<br/>Go HTTP API<br/>localhost:8080"]
        DB[("postgres<br/>PostgreSQL 17<br/>volume")]
    end

    subgraph API_LAYERS["Слои API"]
        HTTP["httpapi<br/>routes · RBAC · CSRF"]
        DOMAIN["domain<br/>workflow · finance · policy"]
        STORE["store<br/>transactions · migrations"]
    end

    CLIENT -->|"браузер"| WEB
    BANK -->|"браузер"| WEB
    WEB -->|"/api/* reverse proxy"| API
    API --> HTTP --> DOMAIN --> STORE
    STORE -->|"SQL"| DB
    API -->|"migration + seed=2026"| DB

    classDef actor fill:#fff4f2,stroke:#d62f2f,color:#1f1f1f
    classDef service fill:#f7f7f5,stroke:#262626,color:#1f1f1f
    classDef layer fill:#eef2ff,stroke:#4f46e5,color:#1f1f1f
    classDef data fill:#f1f5f9,stroke:#334155,color:#1f1f1f
    class CLIENT,BANK actor
    class WEB,API service
    class HTTP,DOMAIN,STORE layer
    class DB data
```

**Как читать стрелки:**

- браузер видит только web на `localhost:8088`;
- Nginx отдаёт статические React-файлы и пересылает `/api/*` в Go API;
- API вызывает доменную политику и repository внутри одной транзакции;
- PostgreSQL хранит текущее состояние заявки и исторические evidence-записи;
- миграции и seed выполняются при старте API, поэтому отдельная команда для БД не нужна.

## Сквозной запрос заявки

```mermaid
sequenceDiagram
    autonumber
    actor C as Предприниматель
    participant W as React/Nginx
    participant A as Go API
    participant P as Policy + Workflow
    participant D as PostgreSQL

    C->>W: Заполнить и отправить заявку
    W->>A: POST /applications/{id}/submit
    A->>D: BEGIN + SELECT FOR UPDATE
    A->>P: Проверить параметры, финансы и policy
    P-->>A: outcome + decision snapshot
    A->>D: application + revision + evidence + audit
    D-->>A: COMMIT
    A-->>W: Состояние и offer/запрос сведений
    W-->>C: Обновить карточку заявки
```

Submission, accept и simulated signing — транзакционные mutations. `SELECT FOR UPDATE`
сериализует параллельные изменения одной заявки. `version` защищает от устаревшей
карточки, а `Idempotency-Key` делает повтор того же действия безопасным: тот же ключ
возвращает сохранённый ответ, а другой body с тем же ключом получает `409`.

## Где находится бизнес-логика

| Слой | Ответственность | Главные файлы |
|---|---|---|
| `domain` | модели, финансы, прогноз, policy, переходы статусов | `backend/internal/domain` |
| `httpapi` | HTTP-контракт, сессии, RBAC, CSRF, orchestration | `backend/internal/httpapi` |
| `store` | PostgreSQL, миграции, транзакции, immutable evidence | `backend/internal/store` |
| `web` | кабинеты предпринимателя/банка, формы, polling, charts | `web/src` |

## Failure modes и ограничения демо

- ошибка БД откатывает транзакцию, не оставляя частичного решения;
- недоступный mock-БКИ приводит к `manual_review`, а не к молчаливому отказу;
- недостаток документов или оборота приводит к `needs_info`;
- неизвестный engine при replay приводит к `cannot_replay`;
- registry, БКИ, authority, signing и disbursement — явные mock/simulated adapters;
- LLM и платные внешние API не вызываются;
- HTTP имеет timeout и graceful shutdown, логи идут через `slog` с request ID.

Контракт API генерируется из Go-моделей командой `go run ./cmd/contracts`, а
`pnpm test:contract` проверяет OpenAPI и реальные ответы. Frontend дополнительно
проверяется TypeScript, unit-тестами и Playwright E2E.
