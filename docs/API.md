# API quick reference

Полная исполняемая спецификация: `/api/openapi.yaml`; интерактивный локальный Swagger:
`/docs/`. Base path: `/api/v1`. Ошибка: `{code,message,details?,request_id}`.
После `POST /demo/session` cookie `alfa_session` и ответный `csrf_token` используются
на mutations в `X-CSRF-Token`; `Idempotency-Key` обязателен для application actions.

## Session / profiles

- `POST /demo/session` `{persona}` → cookie + actor + csrf. Personas: `A_APPROVED`,
  `B_COUNTEROFFER`, `C_NEEDS_INFO`, `D_DECLINED`, `E_MANUAL_REVIEW`,
  `F_INSUFFICIENT_HISTORY`, `BANK`, `ADMIN`.
- `GET /me`, `GET /companies/me`, `GET /loan-products`.

## Client

- `GET /applications?status=&limit=&offset=`, `POST /applications` (`Params`), `PATCH /applications/{id}`.
- `POST /applications/{id}/documents`: `{kind,name,synthetic,content_base64?}`; max 2 MB,
  PDF magic header / CSV/TXT; prototype stores metadata/hash only.
- `POST /applications/{id}/submit`, `/provide-info`, `/offers/{offerId}/accept`,
  `/sign-simulated`, `/request-offer`.
- `GET /applications/{id}`, `/offers`, `/timeline`, `/decision-passport`.
- `POST /applications/{id}/simulations`: side-effect-free server What-if.
- `GET /companies/me/cashflow`, `POST /companies/me/cashflow/forecast`.
- `POST /companies/me/cashflow/import` `{csv}`: UTF-8 header
  `date,amount,currency,direction,category,description`, max 1 MB / 1000 rows,
  date before 2026-10-01, positive decimal RUB, deterministic ids.

## Bank

- `GET /bank/applications?status=&limit=&offset=`.
- `GET /bank/applications/{id}/checks`, `/audit`.
- `POST /bank/applications/{id}/request-info` `{message}`.
- `POST /bank/applications/{id}/decide` `{decision:offer|decline,reason}`.
- `POST /bank/applications/{id}/decision-passport/replay` `{decision_id?}`.

## Infrastructure / demo

- `GET /health/live`, `GET /health/ready`, `GET /metrics` (bank).
- `POST /demo/reset` `{confirm:RESET_SYNTHETIC_DATA}` (admin + DEMO_MODE only).
