# Операционный runbook

## Чистый прогон

```powershell
docker compose down
docker compose up --build -d
docker compose ps
Invoke-WebRequest http://localhost:8088/api/v1/health/ready
.\scripts\smoke.ps1
```

Smoke создаёт дополнительную синтетическую заявку A и завершает её в `issued`; он не сбрасывает
БД. Для повторяемого UI E2E global setup сам выполняет dev-only reset.

## Ручное восстановление seed

1. http://localhost:8088/demo
2. «Управление демо-стендом»
3. checkbox о удалении учебных заявок
4. «Сбросить синтетические данные»

Альтернатива через API:
```powershell
$s=Invoke-RestMethod http://localhost:8088/api/v1/demo/session -Method Post -ContentType application/json -Body '{"persona":"ADMIN"}' -SessionVariable c
Invoke-RestMethod http://localhost:8088/api/v1/demo/reset -Method Post -WebSession $c -Headers @{"X-CSRF-Token"=$s.csrf_token} -ContentType application/json -Body '{"confirm":"RESET_SYNTHETIC_DATA"}'
```

## Что смотреть при проблеме

- `docker compose logs api --tail=100`: request ID, safe error, readiness.
- `docker compose logs web --tail=100`: Nginx.
- `docker compose exec postgres pg_isready -U alfa_demo -d alfa_flow`.
- При `409 CONFLICT` сначала перечитать заявку: это optimistic version / повторный ключ.
- При `403 CSRF` перечитать `/me` или заново выбрать demo persona.

## Reset / data loss

`docker compose down -v` удаляет volume Postgres и все synthetic applications.
Не выполняйте эту команду для обычной остановки. Сохранение данных: `docker compose stop`.
