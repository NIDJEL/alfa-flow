// Generate OpenAPI from the same Go structs used by the API.
package main

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"time"

	"alfaflow/internal/domain"
)

type M = map[string]any

var schemas = M{}

func schema(t reflect.Type) M {
	if t == reflect.TypeOf(time.Time{}) {
		return M{"type": "string", "format": "date-time"}
	}
	if t.Kind() == reflect.Pointer {
		s := schema(t.Elem())
		s["nullable"] = true
		return s
	}
	switch t.Kind() {
	case reflect.String:
		return M{"type": "string"}
	case reflect.Bool:
		return M{"type": "boolean"}
	case reflect.Int, reflect.Int64:
		return M{"type": "integer", "format": "int64"}
	case reflect.Float64:
		return M{"type": "number", "format": "double"}
	case reflect.Slice:
		return M{"type": "array", "items": schema(t.Elem()), "nullable": true}
	case reflect.Struct:
		name := t.Name()
		if schemas[name] == nil {
			schemas[name] = M{}
			props := M{}
			for i := 0; i < t.NumField(); i++ {
				f := t.Field(i)
				key := strings.Split(f.Tag.Get("json"), ",")[0]
				if key == "" || key == "-" {
					continue
				}
				props[key] = schema(f.Type)
			}
			schemas[name] = M{"type": "object", "properties": props}
		}
		return M{"$ref": "#/components/schemas/" + name}
	default:
		return M{"type": "object"}
	}
}
func ref(name string) M { return M{"$ref": "#/components/schemas/" + name} }
func arr(name string) M { return M{"type": "array", "items": ref(name)} }
func obj(p M, required ...string) M {
	result := M{"type": "object", "properties": p, "additionalProperties": false}
	if len(required) > 0 {
		result["required"] = required
	}
	return result
}
func main() {
	for _, v := range []any{domain.Actor{}, domain.Company{}, domain.Params{}, domain.Product{}, domain.Application{}, domain.Decision{}, domain.Cashflow{}, domain.Forecast{}, domain.Offer{}, domain.Event{}, domain.Check{}, domain.Evaluation{}, domain.Snapshot{}} {
		schema(reflect.TypeOf(v))
	}
	str := M{"type": "string"}
	integer := M{"type": "integer", "minimum": 1}
	consent := M{"type": "boolean", "enum": []bool{true}}
	version := M{"version": integer}
	with := func(p M, required ...string) M {
		q := M{}
		for k, v := range version {
			q[k] = v
		}
		for k, v := range p {
			q[k] = v
		}
		return obj(q, append([]string{"version"}, required...)...)
	}
	schemas["Error"] = obj(M{"code": str, "message": str, "request_id": M{"type": "string", "format": "uuid"}}, "code", "message", "request_id")
	schemas["Session"] = obj(M{"actor": ref("Actor"), "csrf_token": str}, "actor", "csrf_token")
	schemas["Persona"] = obj(M{"persona": str, "name": str, "role": str, "company_id": str}, "persona", "name", "role")
	params := schemas["Params"].(M)
	params["required"] = []string{"product_id", "purpose", "amount_kopeks", "term_months", "declared_revenue_kopeks"}
	params["additionalProperties"] = false
	schemas["Simulation"] = obj(M{"scenario_id": str, "evaluation": ref("Evaluation"), "eligibility": str, "monthly_payment_kopeks": M{"type": "integer"}, "total_cost_kopeks": M{"type": "integer"}, "coverage_ratio": M{"type": "number", "nullable": true}, "cash_gap_date": M{"type": "string", "nullable": true}, "forecast_min_balance_kopeks": M{"type": "integer"}, "forecast": ref("Forecast"), "alternatives": arr("Alternative"), "assumptions": M{"type": "array", "items": str}}, "scenario_id", "evaluation", "monthly_payment_kopeks", "eligibility")
	paths := M{}
	op := func(method, path, summary, role string, body, response M) {
		if paths[path] == nil {
			paths[path] = M{}
		}
		responses := M{"200": M{"description": "Успешный ответ", "content": M{"application/json": M{"schema": response}}}}
		if method == "post" && path == "/applications" {
			responses["201"] = responses["200"]
			delete(responses, "200")
		}
		for _, code := range []string{"400", "401", "403", "404", "409", "413", "422", "429", "500"} {
			responses[code] = M{"description": "Структурированная ошибка", "content": M{"application/json": M{"schema": ref("Error")}}}
		}
		o := M{"summary": summary, "tags": []string{role}, "operationId": strings.ReplaceAll(strings.NewReplacer("/", "_", "{", "", "}", "", "-", "_").Replace(method+path), "__", "_"), "responses": responses}
		parameters := []M{}
		for _, name := range []string{"id", "offerId"} {
			if strings.Contains(path, "{"+name+"}") {
				parameters = append(parameters, M{"name": name, "in": "path", "required": true, "schema": M{"type": "string", "format": "uuid"}})
			}
		}
		if role != "public" {
			o["security"] = []M{{"demoCookie": []string{}}}
		}
		if body != nil {
			o["requestBody"] = M{"required": true, "content": M{"application/json": M{"schema": body}}}
			if role != "public" {
				parameters = append(parameters, M{"name": "X-CSRF-Token", "in": "header", "required": true, "schema": str})
			}
		}
		if body != nil && (strings.Contains(path, "{id}") && !strings.Contains(path, "replay") && !strings.Contains(path, "simulations")) {
			parameters = append(parameters, M{"name": "Idempotency-Key", "in": "header", "required": true, "schema": M{"type": "string", "maxLength": 128}})
		}
		if path == "/applications" && method == "get" || path == "/bank/applications" {
			for _, n := range []string{"limit", "offset", "status"} {
				parameters = append(parameters, M{"name": n, "in": "query", "schema": str})
			}
		}
		if len(parameters) > 0 {
			o["parameters"] = parameters
		}
		paths[path].(M)[method] = o
	}
	op("get", "/health/live", "Liveness", "public", nil, M{"type": "object"})
	op("get", "/health/ready", "Readiness PostgreSQL", "public", nil, M{"type": "object"})
	op("get", "/demo/personas", "Синтетические профили", "public", nil, arr("Persona"))
	op("post", "/demo/session", "Демонстрационный вход (только DEMO_MODE)", "public", obj(M{"persona": str}, "persona"), ref("Session"))
	op("post", "/demo/reset", "Явный сброс только синтетики", "demo_admin", obj(M{"confirm": M{"type": "string", "enum": []string{"RESET_SYNTHETIC_DATA"}}}, "confirm"), M{"type": "object"})
	op("get", "/me", "Сеанс и CSRF token", "authenticated", nil, ref("Session"))
	op("get", "/companies/me", "Предзаполненный профиль компании", "client", nil, ref("Company"))
	op("get", "/loan-products", "Гипотетические продукты 2026", "authenticated", nil, arr("Product"))
	op("get", "/applications", "Собственные заявки", "client", nil, arr("Application"))
	op("post", "/applications", "Создать черновик", "client", ref("Params"), ref("Application"))
	op("get", "/applications/{id}", "Карточка; внутренние данные скрыты у клиента", "client/bank", nil, ref("Application"))
	pp := M{"version": integer, "product_id": str, "purpose": str, "amount_kopeks": M{"type": "integer"}, "term_months": integer, "declared_revenue_kopeks": M{"type": "integer"}}
	op("patch", "/applications/{id}", "Сохранить только черновик", "client", obj(pp, "version", "product_id", "purpose", "amount_kopeks", "term_months", "declared_revenue_kopeks"), ref("Application"))
	op("post", "/applications/{id}/submit", "Отправить и выполнить pipeline", "client", with(M{"consent": consent}, "consent"), ref("Application"))
	op("post", "/applications/{id}/provide-info", "Ответить на конкретный запрос", "client", with(M{"consent": consent, "request_id": str, "answer": str, "declared_revenue_kopeks": M{"type": "integer"}}, "consent", "request_id", "answer"), ref("Application"))
	op("post", "/applications/{id}/documents", "Прикрепить демо-документ / метаданные до 2 МБ", "client", with(M{"kind": str, "name": str, "synthetic": M{"type": "boolean"}, "content_base64": str}, "kind", "name"), ref("Application"))
	op("get", "/applications/{id}/offers", "Неизменяемые версии предложений", "client/bank", nil, arr("Offer"))
	op("post", "/applications/{id}/offers/{offerId}/accept", "Принять только активное предложение", "client", with(M{"consent": consent}, "consent"), ref("Application"))
	op("post", "/applications/{id}/sign-simulated", "Согласие и автоматическая имитация выдачи", "client", with(M{"consent": consent}, "consent"), ref("Application"))
	op("post", "/applications/{id}/request-offer", "Создать новое предложение без изменения исходного запроса", "client", obj(pp, "version", "product_id", "purpose", "amount_kopeks", "term_months", "declared_revenue_kopeks"), ref("Application"))
	op("get", "/applications/{id}/timeline", "Хронология", "client/bank", nil, arr("Event"))
	op("get", "/applications/{id}/decision-passport", "Исторические решения; RBAC-проекция", "client/bank", nil, arr("Decision"))
	op("post", "/applications/{id}/simulations", "What-if без изменения заявки; денежные факты из snapshot", "client", ref("Params"), ref("Simulation"))
	op("get", "/companies/me/cashflow", "История операций и агрегаты", "client", nil, ref("Cashflow"))
	op("post", "/companies/me/cashflow/import", "Импорт UTF-8 CSV (до 1 МБ), исторические snapshots не меняются", "client", obj(M{"csv": M{"type": "string", "maxLength": 1048576}}, "csv"), obj(M{"imported_count": M{"type": "integer"}, "duplicate_count": M{"type": "integer"}, "source": str, "snapshots_unchanged": M{"type": "boolean"}}))
	op("post", "/companies/me/cashflow/forecast", "Прогноз без ML", "client", obj(M{"horizon_days": M{"type": "integer", "enum": []int{30, 60, 90}}}, "horizon_days"), ref("Forecast"))
	op("get", "/bank/applications", "Очередь с фильтром и пагинацией", "bank_analyst", nil, arr("Application"))
	op("get", "/bank/applications/{id}/checks", "Артефакты mock-проверок", "bank_analyst", nil, arr("Check"))
	op("post", "/bank/applications/{id}/request-info", "Запрос сведений внутри платформы", "bank_analyst", with(M{"message": M{"type": "string", "minLength": 8, "maxLength": 2000}}, "message"), ref("Application"))
	op("post", "/bank/applications/{id}/decide", "Мотивированное ручное решение без обхода hard-stop", "bank_analyst", with(M{"decision": M{"type": "string", "enum": []string{"offer", "decline"}}, "reason": M{"type": "string", "minLength": 8, "maxLength": 2000}}, "decision", "reason"), ref("Application"))
	op("post", "/bank/applications/{id}/decision-passport/replay", "Replay исходного snapshot и версии", "bank_analyst", obj(M{"decision_id": str}), M{"type": "object", "properties": M{"match": M{"type": "boolean"}, "status": str, "diff": M{"type": "array", "items": str}, "decision_id": str, "input_sha256": str, "ruleset_version": str, "result": ref("Evaluation")}})
	op("get", "/bank/applications/{id}/audit", "Append-only аудит", "bank_analyst", nil, arr("Event"))
	op("get", "/metrics", "Счётчики демо", "bank_analyst", nil, M{"type": "object"})
	spec := M{"openapi": "3.0.3", "info": M{"title": "ALFA FLOW — синтетический кредитный кабинет", "version": "1.0.0", "description": "Не официальный банковский продукт. Demo IAM, гипотетические условия. Без платных API. client получает отфильтрованный паспорт без input_snapshot_json/actor/внутренних порогов."}, "servers": []M{{"url": "/api/v1"}}, "paths": paths, "components": M{"schemas": schemas, "securitySchemes": M{"demoCookie": M{"type": "apiKey", "in": "cookie", "name": "alfa_session"}}}}
	b, _ := json.MarshalIndent(spec, "", "  ")
	if e := os.WriteFile("../api/openapi.yaml", append(b, '\n'), 0644); e != nil {
		panic(e)
	}
}
