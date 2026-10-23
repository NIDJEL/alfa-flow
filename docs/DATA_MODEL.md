# Модель данных

Схема сочетает aggregate `credit_applications` с нормализованными историческими
таблицами. Деньги хранятся как `int64` копейки RUB, APR — basis points
(`2200 = 22%`), даты — `timestamptz` в UTC, доменные сущности — UUID.
Снимки решения и внешние ответы сохраняются в JSONB, чтобы replay видел исходные факты.

## 1. Компания, доступ и заявка

Здесь показаны реальные SQL-колонки. `data` — JSONB с бизнес-полями
(названием компании, параметрами заявки, фактами и т. п.), а не отдельные колонки.

```mermaid
erDiagram
    direction LR
    users ||--o{ memberships : has
    companies ||--o{ memberships : includes
    companies ||--o{ credit_applications : owns
    companies ||--o{ financial_transactions : has
    companies ||--o{ cashflow_imports : imports
    users ||--o{ cashflow_imports : imports

    users {
        uuid id PK
        string persona UK
        text role
    }
    companies {
        uuid id PK
        jsonb data
    }
    memberships {
        uuid user_id PK, FK
        uuid company_id PK, FK
    }
    credit_applications {
        uuid id PK
        uuid company_id FK
        text status
        int version
        jsonb data
    }
    financial_transactions {
        uuid id PK
        uuid company_id FK
        jsonb data
    }
    cashflow_imports {
        uuid id PK
        uuid company_id FK
        uuid actor_id FK
        text source_sha256
    }
```

**Легенда:** `PK` — первичный ключ, `FK` — внешний ключ, `UK` — уникальность;
`||--o{` — «один к нулю или многим», `||--o|` — «один к нулю или одному».
У `memberships` составной PK `(user_id, company_id)`.

## 2. Решение и условия

Каждая заявка может иметь много версий исходных данных, проверок и решений.
Повторное решение добавляет evidence, не изменяя предыдущий snapshot.

```mermaid
erDiagram
    direction LR
    credit_applications ||--o{ application_revisions : versions
    credit_applications ||--o{ documents : supports
    credit_applications ||--o{ financial_snapshots : freezes
    credit_applications ||--o{ external_check_runs : checks
    credit_applications ||--o{ score_runs : scores
    credit_applications ||--o{ decision_runs : records
    credit_applications ||--o{ loan_offers : proposes

    application_revisions {
        uuid application_id PK, FK
        int version PK
        jsonb data
    }
    financial_snapshots {
        text id PK
        uuid application_id FK
        jsonb data
    }
    loan_offers {
        uuid id PK
        uuid application_id FK
        int revision
        jsonb data
    }
```

`loan_offers` имеет `UNIQUE(application_id, revision)`. У `documents`,
`external_check_runs`, `score_runs` и `decision_runs` одинаковый SQL-каркас:
`id UUID`, `application_id UUID`, `data JSONB`.

## 3. След действий и результат

```mermaid
erDiagram
    direction LR
    credit_applications ||--o{ application_events : traces
    credit_applications ||--o{ audit_logs : audits
    credit_applications ||--o{ notifications : notifies
    credit_applications ||--o| simulated_disbursements : issues

    application_events {
        uuid id PK
        uuid application_id FK
        jsonb data
    }
    simulated_disbursements {
        uuid id PK
        uuid application_id FK, UK
        timestamptz created_at
    }
```

Для `audit_logs` и `notifications` каркас такой же, как у `application_events`.
Один application ID может иметь только одну `simulated_disbursements` — это
дополнительная защита от повторной демо-выдачи.

## Вспомогательные таблицы

Они намеренно отделены от графа FK:

```mermaid
erDiagram
    direction LR
    sessions {
        text token_hash PK
        jsonb actor
        timestamptz expires_at
    }
    loan_products {
        text id PK
        jsonb data
    }
    rule_sets {
        text id PK
        text version PK
        jsonb data
    }
    idempotency_keys {
        uuid actor_id PK
        text action PK
        text key PK
        text request_hash
        jsonb response
    }
```

## Что хранится где

| Группа | Таблицы | Зачем |
|---|---|---|
| Identity | `users`, `memberships`, `sessions` | синтетическая persona, доступ к компании и cookie-сессии |
| Aggregate | `credit_applications` | текущий статус, версия, параметры и указатели active offer |
| Inputs | `application_revisions`, `documents`, `financial_transactions` | исходные данные, документы и история оборота |
| Decision evidence | `decision_runs`, `financial_snapshots`, `external_check_runs`, `score_runs` | объяснение результата и точные входные факты |
| Offer | `loan_offers` | неизменяемые версии условий, включая counteroffer |
| Timeline | `application_events`, `audit_logs`, `notifications` | события, аудит и сообщения внутри продукта |
| Output | `simulated_disbursements` | единственная запись демо-выдачи на заявку |
| Safety | `idempotency_keys` | повтор действия без повторного события или выдачи |
| Import | `cashflow_imports` | hash/метаданные CSV, не переписывает старые snapshots |

## Историчность и ограничения

`application_revisions`, snapshots, checks, scores, decisions, offers, events и audit
защищены DB-триггерами от `UPDATE`/`DELETE`. Новое решение добавляет новую запись,
а не переписывает прошлое. `INSERT ... ON CONFLICT DO NOTHING` используется для
идемпотентного seed и не изменяет исторические значения.

На схеме показаны реальные SQL FK; `sessions` содержит actor snapshot в JSONB,
а `idempotency_keys.actor_id` хранится без FK. `loan_products` и `rule_sets` — отдельные
каталоги, а не SQL-связь между собой. Параметры заявки
хранят выбранный product code, а decision snapshot фиксирует использованную версию policy.
Поля на диаграмме сокращены; источник истины —
[`schema.sql`](../backend/internal/store/schema.sql). Миграции 1 и 2 применяются
при старте API.

В seed `2026` — 20 синтетических компаний, стабильные demo ID и значения
`DEMO-ИНН-*`; реальных ФИО и номеров счетов нет. Период финансовой истории —
апрель–сентябрь 2026. Профиль F специально содержит только один месяц, чтобы
продукт честно перешёл в `needs_info`, а не придумал прогноз.

`docker compose down -v` удаляет volume целиком. Dev-only admin reset очищает
синтетические данные перечисленных таблиц через `TRUNCATE`, затем повторяет seed.
Это не production-механизм удаления истории; он доступен только после явного
подтверждения через UI/API. Migration user и runtime user в прототипе не разделены.
