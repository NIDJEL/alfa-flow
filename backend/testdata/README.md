# Синтетические fixtures

Единственный исполняемый генератор — `internal/domain/seed.go`, seed=2026.
Компания ID / тестовый идентификатор стабильны; заявкам, событиям и check runs выдаются UUID.
Нет настоящих ИНН/ФИО/счетов. История полностью синтетическая, не внешний dataset.

A stable offer, B counteroffer, C needs-info, D legal hard-stop decline,
E unavailable BKI/manual review, F short history. Остальные 14 — нейтральные offer cases.

Детерминизм относится к финансовым данным и ожидаемым outcomes, не timestamps/random event UUID.
API startup не перезаписывает изменённые fixtures. Для воспроизводимости используйте явный demo reset.
