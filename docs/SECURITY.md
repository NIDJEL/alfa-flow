# Безопасность и доверительная модель

Только синтетический локальный прототип. **Не размещать публично с DEMO_MODE=true**:
demo login намеренно даёт выбор любой seed persona, включая банк/admin. Это не production IAM.
Compose порты привязаны к 127.0.0.1. Секретов и реальных данных в исходниках нет.

- HttpOnly + SameSite=Strict cookie, 12 часов. Secure=true при PUBLIC_ORIGIN=https.
- Session bearer hash в PostgreSQL, сервер определяет actor/tenant; JSON role/company_id не принимается.
- Изоляция каждой карточки, клиентских списков и actions; банк проверяется backend.
- Mutations: CSRF token + проверка Origin; login доступен только в DEMO_MODE.
- Rate limit demo login 60/min per remote IP. Общий per-user rate limit остальных actions пока не реализован.
- Strict JSON/unknown fields, max body 3 MiB, document max 2 MiB, типы TXT/CSV/PDF,
  PDF magic header, запрет path separators. Сохраняются метаданные и hash, **не содержимое файла**.
- SQL параметры, request ID, safe structured errors, HTML в пользовательском тексте React escaping.
- ROW lock, version, action/body-aware idempotency и unique disbursement.
- Historical evidence tables защищены trigger от UPDATE/DELETE; runtime сервис append-only.
  Owner DB всё ещё может TRUNCATE: migration/runtime роли не разделены, admin reset — явное dev исключение.
- Нет LLM, OCR и внешней передачи финансов. Нет запросов к paid API.
- Заголовки nosniff, X-Frame-Options DENY на web, Referrer-Policy. TLS завершение вне Compose.
- API health/readiness, bounded HTTP/context timeouts, graceful shutdown, request ID.

Проверено: IDOR, forged bank action, invalid JSON, CSRF, path traversal, double actions,
concurrent submit, intentional rollback. Исторический replay не перезаписывает decision.
Безопасность прототипа не равна независимому pentest.

Dependency audit: `pnpm audit` (runtime + dev) после обновления React Router и TypeScript ESLint:
**0 известных уязвимостей**. Непатченный braces удалён из dependency tree переходом
typescript-eslint на 8.72.0 (tinyglobby вместо fast-glob). Go govulncheck после Go 1.27.3,
pgx 5.9.2 и x/text 0.41.0: **No vulnerabilities found**.
Это снимок состояния advisory DB, не доказательство отсутствия неизвестных уязвимостей.

До production: OIDC/MFA, scoped IAM, revoke/logout, CSRF secret rotation, TLS/HSTS/CSP,
runtime DB least privilege, isolated migrations, encrypted object store + antivirus/OCR,
audit retention/signatures, redaction policy, request throttling, legal review, calibrated
policy, full integration monitoring, backup/recovery и independent security review.
