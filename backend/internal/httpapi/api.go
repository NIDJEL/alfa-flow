package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"alfaflow/internal/domain"
	"alfaflow/internal/store"
	"github.com/jackc/pgx/v5"
)

type API struct {
	DB    *store.Store
	Demo  bool
	mu    sync.Mutex
	rates map[string][]time.Time
}
type problem struct {
	Status        int
	Code, Message string
}

func (p *problem) Error() string { return p.Message }
func bad(msg string) error       { return &problem{422, "VALIDATION_ERROR", msg} }
func forbidden() error           { return &problem{403, "FORBIDDEN", "Доступ запрещён"} }

type endpoint func(http.ResponseWriter, *http.Request) error
type ctxKey string

const actorKey ctxKey = "actor"
const requestKey ctxKey = "request_id"

func actor(r *http.Request) domain.Actor {
	a, _ := r.Context().Value(actorKey).(domain.Actor)
	return a
}

func New(s *store.Store, demo bool) http.Handler {
	a := &API{DB: s, Demo: demo, rates: map[string][]time.Time{}}
	m := http.NewServeMux()
	register := func(pattern string, h endpoint) {
		m.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			if e := h(w, r); e != nil {
				a.fail(w, r, e)
			}
		})
	}
	register("GET /api/v1/health/live", func(w http.ResponseWriter, r *http.Request) error {
		return respond(w, 200, map[string]any{"status": "ok"})
	})
	register("GET /api/v1/health/ready", func(w http.ResponseWriter, r *http.Request) error {
		if e := s.Pool.Ping(r.Context()); e != nil {
			return e
		}
		return respond(w, 200, map[string]any{"status": "ready", "engine": domain.EngineVersion, "ai_enabled": false})
	})
	register("GET /api/v1/demo/personas", a.personas)
	register("POST /api/v1/demo/session", a.login)
	register("POST /api/v1/demo/reset", a.reset)
	register("GET /api/v1/me", a.me)
	register("GET /api/v1/companies/me", a.company)
	register("GET /api/v1/loan-products", func(w http.ResponseWriter, r *http.Request) error {
		if actor(r).ID == "" {
			return forbidden()
		}
		return respond(w, 200, domain.Products())
	})
	register("GET /api/v1/applications", a.list)
	register("POST /api/v1/applications", a.create)
	register("GET /api/v1/applications/{id}", a.detail)
	register("PATCH /api/v1/applications/{id}", a.action("patch"))
	for _, action := range []string{"submit", "provide-info", "sign-simulated", "request-offer", "documents"} {
		register("POST /api/v1/applications/{id}/"+action, a.action(action))
	}
	register("POST /api/v1/applications/{id}/offers/{offerId}/accept", a.action("accept"))
	register("GET /api/v1/applications/{id}/offers", a.subresource("offers"))
	register("GET /api/v1/applications/{id}/timeline", a.subresource("timeline"))
	register("GET /api/v1/applications/{id}/decision-passport", a.subresource("passport"))
	register("POST /api/v1/applications/{id}/simulations", a.simulate)
	register("GET /api/v1/companies/me/cashflow", a.cashflow)
	register("POST /api/v1/companies/me/cashflow/import", a.importCashflow)
	register("POST /api/v1/companies/me/cashflow/forecast", a.forecast)
	register("GET /api/v1/bank/applications", a.bankList)
	for _, resource := range []string{"checks", "audit"} {
		register("GET /api/v1/bank/applications/{id}/"+resource, a.subresource(resource))
	}
	for _, action := range []string{"request-info", "decide"} {
		register("POST /api/v1/bank/applications/{id}/"+action, a.action(action))
	}
	register("POST /api/v1/bank/applications/{id}/decision-passport/replay", a.replay)
	register("GET /api/v1/metrics", a.metrics)
	m.HandleFunc("GET /api/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		path := "contracts/openapi.yaml"
		if _, e := os.Stat(path); e != nil {
			path = "../api/openapi.yaml"
		}
		http.ServeFile(w, r, path)
	})
	m.Handle("GET /docs/", http.StripPrefix("/docs/", http.FileServer(http.Dir("swagger"))))
	return a.middleware(m)
}
func respond(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}
func (a *API) fail(w http.ResponseWriter, r *http.Request, e error) {
	status, code, message := 500, "INTERNAL_ERROR", "Внутренняя ошибка. Повторите позже."
	var p *problem
	switch {
	case errors.As(e, &p):
		status, code, message = p.Status, p.Code, p.Message
	case errors.Is(e, pgx.ErrNoRows):
		status, code, message = 404, "NOT_FOUND", "Заявка или профиль не найдены"
	case errors.Is(e, store.ErrConflict), errors.Is(e, store.ErrIdempotency):
		status, code, message = 409, "CONFLICT", e.Error()
	default:
		slog.Error("request failed", "request_id", r.Context().Value(requestKey), "error", e)
	}
	_ = respond(w, status, map[string]any{"code": code, "message": message, "request_id": r.Context().Value(requestKey)})
}
func decode(r *http.Request, v any) error {
	b, e := io.ReadAll(io.LimitReader(r.Body, 3*1024*1024+1))
	if e != nil {
		return bad("Не удалось прочитать запрос")
	}
	if len(b) > 3*1024*1024 {
		return &problem{413, "PAYLOAD_TOO_LARGE", "Максимальный размер запроса 3 МБ"}
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if e = d.Decode(v); e != nil {
		return bad("Некорректный JSON или неизвестные поля")
	}
	if d.Decode(new(any)) != io.EOF {
		return bad("Ожидается одно JSON-тело")
	}
	return nil
}
func (a *API) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := domain.ID()
		w.Header().Set("X-Request-ID", id)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "same-origin")
		ctx, cancel := context.WithTimeout(context.WithValue(r.Context(), requestKey, id), 20*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		defer func() {
			if x := recover(); x != nil {
				a.fail(w, r, fmt.Errorf("panic: %v", x))
			}
		}()
		if cookie, e := r.Cookie("alfa_session"); e == nil {
			if ac, err := a.DB.Session(ctx, cookie.Value); err == nil {
				r = r.WithContext(context.WithValue(ctx, actorKey, ac))
			}
		}
		mutation := r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS"
		if mutation {
			origin := r.Header.Get("Origin")
			expected := os.Getenv("PUBLIC_ORIGIN")
			if expected == "" {
				expected = "http://" + r.Host
			}
			if origin != "" && origin != expected {
				a.fail(w, r, &problem{403, "CSRF", "Недопустимый источник запроса"})
				return
			}
			if actor(r).ID != "" && r.URL.Path != "/api/v1/demo/session" {
				c, _ := r.Cookie("alfa_session")
				if c == nil || r.Header.Get("X-CSRF-Token") != domain.Hash(c.Value) {
					a.fail(w, r, &problem{403, "CSRF", "Обновите сеанс: CSRF token отсутствует"})
					return
				}
			}
		}
		if !strings.HasPrefix(r.URL.Path, "/api/v1/demo/") && !strings.Contains(r.URL.Path, "/health/") && strings.HasPrefix(r.URL.Path, "/api/v1/") && actor(r).ID == "" {
			a.fail(w, r, &problem{401, "UNAUTHENTICATED", "Выберите демонстрационный профиль"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (a *API) personas(w http.ResponseWriter, r *http.Request) error {
	if !a.Demo {
		return forbidden()
	}
	cs, e := a.DB.Companies(r.Context())
	if e != nil {
		return e
	}
	result := []map[string]any{}
	for _, c := range cs {
		result = append(result, map[string]any{"persona": c.Persona, "name": c.Name, "role": "client", "company_id": c.ID})
	}
	result = append(result, map[string]any{"persona": "BANK", "name": "Рабочее место аналитика", "role": "bank_analyst"}, map[string]any{"persona": "ADMIN", "name": "Администратор демо", "role": "demo_admin"})
	return respond(w, 200, result)
}
func (a *API) login(w http.ResponseWriter, r *http.Request) error {
	if !a.Demo {
		return forbidden()
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	now := time.Now()
	a.mu.Lock()
	valid := []time.Time{}
	for _, t := range a.rates[host] {
		if now.Sub(t) < time.Minute {
			valid = append(valid, t)
		}
	}
	valid = append(valid, now)
	a.rates[host] = valid
	a.mu.Unlock()
	if len(valid) > 60 {
		return &problem{429, "RATE_LIMIT", "Слишком много переключений профиля. Подождите минуту."}
	}
	var body struct {
		Persona string `json:"persona"`
	}
	if e := decode(r, &body); e != nil {
		return e
	}
	ac, e := a.DB.Persona(r.Context(), body.Persona)
	if e != nil {
		return e
	}
	token, e := a.DB.Login(r.Context(), ac)
	if e != nil {
		return e
	}
	http.SetCookie(w, &http.Cookie{Name: "alfa_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: strings.HasPrefix(os.Getenv("PUBLIC_ORIGIN"), "https://"), MaxAge: 43200})
	return respond(w, 200, map[string]any{"actor": ac, "csrf_token": domain.Hash(token)})
}
func (a *API) me(w http.ResponseWriter, r *http.Request) error {
	c, _ := r.Cookie("alfa_session")
	if c == nil {
		return forbidden()
	}
	return respond(w, 200, map[string]any{"actor": actor(r), "csrf_token": domain.Hash(c.Value)})
}
func require(r *http.Request, role string) error {
	if actor(r).Role != role {
		return forbidden()
	}
	return nil
}
func (a *API) company(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	c, e := a.DB.Company(r.Context(), actor(r).CompanyID)
	if e != nil {
		return e
	}
	return respond(w, 200, c)
}
func page(r *http.Request) (int, int) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
func (a *API) list(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	limit, offset := page(r)
	all, e := a.DB.List(r.Context(), actor(r).CompanyID, r.URL.Query().Get("status"), limit, offset)
	if e != nil {
		return e
	}
	result := []any{}
	for _, v := range all {
		result = append(result, publicApplication(v, actor(r)))
	}
	return respond(w, 200, result)
}
func (a *API) bankList(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "bank_analyst"); e != nil {
		return e
	}
	limit, offset := page(r)
	all, e := a.DB.List(r.Context(), "", r.URL.Query().Get("status"), limit, offset)
	if e != nil {
		return e
	}
	return respond(w, 200, all)
}
func (a *API) accessible(r *http.Request) (domain.Application, error) {
	id := r.PathValue("id")
	rawID := strings.ReplaceAll(id, "-", "")
	_, uuidErr := hex.DecodeString(rawID)
	if len(id) != 36 || len(rawID) != 32 || uuidErr != nil || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		return domain.Application{}, &problem{404, "NOT_FOUND", "Заявка не найдена"}
	}
	v, e := a.DB.Get(r.Context(), id)
	if e != nil {
		return v, e
	}
	ac := actor(r)
	if ac.Role != "bank_analyst" && (ac.Role != "client" || v.CompanyID != ac.CompanyID) {
		return v, forbidden()
	}
	return v, nil
}
func publicApplication(v domain.Application, ac domain.Actor) any {
	b, _ := json.Marshal(v)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	if ac.Role == "bank_analyst" {
		return m
	}
	// Client gets explanations, not internal policy thresholds or raw check artifacts.
	if decisions, ok := m["decisions"].([]any); ok {
		for _, x := range decisions {
			d := x.(map[string]any)
			delete(d, "input_snapshot_json")
			delete(d, "actor")
			result := d["result"].(map[string]any)
			if rules, ok := result["triggered_rules"].([]any); ok {
				for _, rv := range rules {
					rule := rv.(map[string]any)
					delete(rule, "threshold")
					delete(rule, "input")
				}
			}
		}
	}
	return m
}
func (a *API) detail(w http.ResponseWriter, r *http.Request) error {
	v, e := a.accessible(r)
	if e != nil {
		return e
	}
	return respond(w, 200, publicApplication(v, actor(r)))
}
func (a *API) create(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	var p domain.Params
	if e := decode(r, &p); e != nil {
		return e
	}
	if _, e := domain.Validate(p, domain.Products()); e != nil {
		return bad(e.Error())
	}
	c, e := a.DB.Company(r.Context(), actor(r).CompanyID)
	if e != nil {
		return e
	}
	v := domain.NewDraft(c, p)
	if e = a.DB.Create(r.Context(), v); e != nil {
		return e
	}
	return respond(w, 201, publicApplication(v, actor(r)))
}

type actionBody struct {
	domain.Params
	Version   int    `json:"version"`
	Consent   bool   `json:"consent"`
	Reason    string `json:"reason"`
	Decision  string `json:"decision"`
	RequestID string `json:"request_id"`
	Answer    string `json:"answer"`
	Message   string `json:"message"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Content   string `json:"content_base64"`
	Synthetic bool   `json:"synthetic"`
}

func (a *API) action(action string) endpoint {
	return func(w http.ResponseWriter, r *http.Request) error {
		v, e := a.accessible(r)
		if e != nil {
			return e
		}
		ac := actor(r)
		bank := action == "request-info" || action == "decide"
		if bank {
			if e = require(r, "bank_analyst"); e != nil {
				return e
			}
		} else {
			if e = require(r, "client"); e != nil {
				return e
			}
		}
		var body actionBody
		if e = decode(r, &body); e != nil {
			return e
		}
		key := r.Header.Get("Idempotency-Key")
		if key == "" || len(key) > 128 {
			return bad("Нужен Idempotency-Key (до 128 символов)")
		}
		c, e := a.DB.Company(r.Context(), v.CompanyID)
		if e != nil {
			return e
		}
		result, e := a.DB.Mutate(r.Context(), v.ID, ac.ID, r.URL.Path, key, domain.Hash(body), body.Version, func(app *domain.Application) error {
			productFor := func(p domain.Params) (domain.Product, error) {
				pdt, err := domain.Validate(p, domain.Products())
				if err != nil {
					return pdt, bad(err.Error())
				}
				return pdt, nil
			}
			switch action {
			case "patch":
				if app.Status != "draft" {
					return &problem{409, "INVALID_STATE", "Редактировать можно только черновик"}
				}
				if _, err := productFor(body.Params); err != nil {
					return err
				}
				app.Params = body.Params
				domain.AddEvent(app, "draft_saved", ac.ID, "Параметры черновика сохранены")
			case "documents":
				if app.Status != "draft" && app.Status != "needs_info" {
					return &problem{409, "INVALID_STATE", "Документы доступны в черновике или при уточнении"}
				}
				if body.Kind != "statement" && body.Kind != "equipment_invoice" {
					return bad("Неизвестный тип документа")
				}
				if strings.ContainsAny(body.Name, "/\\") || len(body.Name) > 180 {
					return bad("Некорректное имя файла")
				}
				var data []byte
				if body.Synthetic {
					data = []byte("ALFA FLOW SYNTHETIC DOCUMENT seed=2026 kind=" + body.Kind)
				} else {
					var err error
					data, err = base64.StdEncoding.DecodeString(body.Content)
					if err != nil {
						return bad("Некорректное содержимое файла")
					}
				}
				if len(data) == 0 || len(data) > 2*1024*1024 {
					return &problem{413, "FILE_SIZE", "Размер файла должен быть от 1 байта до 2 МБ"}
				}
				name := strings.ToLower(body.Name)
				if !strings.HasSuffix(name, ".pdf") && !strings.HasSuffix(name, ".csv") && !strings.HasSuffix(name, ".txt") {
					return bad("Разрешены PDF, CSV, TXT")
				}
				if !body.Synthetic && strings.HasSuffix(name, ".pdf") && !bytes.HasPrefix(data, []byte("%PDF-")) {
					return bad("Файл не является PDF")
				}
				if len(app.Documents) >= 12 {
					return bad("Не более 12 документов")
				}
				source := "uploaded_metadata_only"
				if body.Synthetic {
					source = "simulated"
				}
				app.Documents = append(app.Documents, domain.Document{ID: domain.ID(), Kind: body.Kind, Name: body.Name, SHA256: domain.HashBytes(data), Size: len(data), Source: source, CreatedAt: time.Now().UTC()})
				domain.AddEvent(app, "document_added", ac.ID, "Документ прикреплён: "+body.Name)
			case "submit", "provide-info":
				if action == "submit" && app.Status != "draft" {
					return &problem{409, "INVALID_STATE", "Заявка уже отправлена"}
				}
				if action == "provide-info" {
					if app.Status != "needs_info" {
						return &problem{409, "INVALID_STATE", "Нет открытого запроса сведений"}
					}
					found := false
					for i := range app.InfoRequests {
						if app.InfoRequests[i].ID == body.RequestID && app.InfoRequests[i].Open {
							found = true
							app.InfoRequests[i].Open = false
							app.InfoRequests[i].Answer = body.Answer
						}
					}
					if !found || strings.TrimSpace(body.Answer) == "" {
						return bad("Укажите запрос и ответ")
					}
					if body.DeclaredRevenue > 0 {
						app.Params.DeclaredRevenue = body.DeclaredRevenue
					}
					domain.AddEvent(app, "information_provided", ac.ID, body.Answer)
				}
				p, err := productFor(app.Params)
				if err != nil {
					return err
				}
				if !body.Consent {
					return bad("Подтвердите корректность синтетических данных")
				}
				app.Revisions = append(app.Revisions, domain.Revision{Version: len(app.Revisions) + 1, Params: app.Params, Documents: append([]domain.Document{}, app.Documents...), At: time.Now().UTC()})
				if app.Status == "draft" {
					if err = domain.Transition(app, "submitted", ac.ID, "Клиент отправил заявку"); err != nil {
						return err
					}
				}
				if err = domain.Transition(app, "validating", "system", "Начата валидация и mock-проверки"); err != nil {
					return err
				}
				if err = domain.Transition(app, "scoring", "system", "Рассчитаны финансовые признаки"); err != nil {
					return err
				}
				d := domain.RunDecision(app, c, p, "system", "", "")
				return domain.ApplyDecision(app, d, "system")
			case "request-info":
				if app.Status != "manual_review" && app.Status != "needs_info" {
					return &problem{409, "INVALID_STATE", "Запрос возможен при ручном рассмотрении или уточнении"}
				}
				if len(strings.TrimSpace(body.Message)) < 8 || len(body.Message) > 2000 {
					return bad("Укажите содержательный запрос (8–2000 символов)")
				}
				for i := range app.InfoRequests {
					app.InfoRequests[i].Open = false
				}
				app.InfoRequests = append(app.InfoRequests, domain.InfoRequest{ID: domain.ID(), Message: body.Message, Open: true})
				if app.Status == "manual_review" {
					return domain.Transition(app, "needs_info", ac.ID, body.Message)
				}
				domain.AddEvent(app, "information_requested", ac.ID, body.Message)
			case "decide":
				if app.Status != "manual_review" {
					return &problem{409, "INVALID_STATE", "Ручное решение допустимо только при ручном рассмотрении"}
				}
				if body.Decision != "offer" && body.Decision != "decline" {
					return bad("Выберите offer или decline")
				}
				if len(strings.TrimSpace(body.Reason)) < 8 || len(body.Reason) > 2000 {
					return bad("Нужно основание решения (8–2000 символов)")
				}
				p, err := productFor(app.Params)
				if err != nil {
					return err
				}
				d := domain.RunDecision(app, c, p, ac.ID, body.Decision, body.Reason)
				if body.Decision == "offer" && d.Result.Outcome != "offer" {
					return &problem{409, "POLICY_BLOCK", "Ручное одобрение не может обходить обязательные правила"}
				}
				if body.Decision == "decline" {
					d.Result.Outcome = "decline"
					app.Decisions[len(app.Decisions)-1] = d
				}
				return domain.ApplyDecision(app, d, ac.ID)
			case "request-offer":
				if app.Status != "offer_issued" {
					return &problem{409, "INVALID_STATE", "Пересмотр доступен до принятия предложения"}
				}
				p, err := productFor(body.Params)
				if err != nil {
					return err
				}
				if len(app.Decisions) == 0 {
					return bad("Нет снимка решения")
				}
				snap := app.Decisions[len(app.Decisions)-1].Input
				// Only contractual dimensions are mutable; financial facts stay in the original snapshot.
				snap.Params.Amount = body.Amount
				snap.Params.Term = body.Term
				snap.Params.ProductID = body.ProductID
				snap.Params.Purpose = body.Purpose
				snap.Product = p
				ev := domain.Evaluate(snap, false)
				if ev.Outcome != "offer" {
					return &problem{409, "INELIGIBLE", "Этот сценарий не проходит правила; выберите допустимый"}
				}
				d := domain.Decision{ID: domain.ID(), ApplicationRevision: len(app.Revisions), Input: snap, InputSHA: domain.Hash(snap), RulesetVersion: snap.Policy.Version, ProductVersion: p.Version, EngineVersion: domain.EngineVersion, Result: ev, Actor: ac.ID, CreatedAt: time.Now().UTC()}
				app.Decisions = append(app.Decisions, d)
				domain.CreateOffer(app, d, snap.Params, "counteroffer")
				domain.AddEvent(app, "offer_revised", ac.ID, "Создана новая версия предложения; исходный запрос сохранён")
			case "accept":
				if app.Status != "offer_issued" || app.ActiveOfferID != r.PathValue("offerId") {
					return &problem{409, "INVALID_OFFER", "Предложение недействительно или уже принято"}
				}
				if !body.Consent {
					return bad("Подтвердите принятие демонстрационного предложения")
				}
				valid := false
				for _, offer := range app.Offers {
					if offer.ID == app.ActiveOfferID && offer.ExpiresAt.After(time.Now()) {
						valid = true
					}
				}
				if !valid {
					return &problem{409, "EXPIRED", "Срок предложения истёк"}
				}
				app.AcceptedOfferID = app.ActiveOfferID
				return domain.Transition(app, "offer_accepted", ac.ID, "Клиент принял предложение")
			case "sign-simulated":
				if app.Status != "offer_accepted" {
					return &problem{409, "INVALID_STATE", "Сначала примите действующее предложение"}
				}
				if !body.Consent {
					return bad("Подтвердите имитацию подписания")
				}
				if err := domain.Transition(app, "signing_simulated", ac.ID, "Согласие на учебное подписание зафиксировано"); err != nil {
					return err
				}
				app.DisbursementID = domain.ID()
				domain.AddEvent(app, "disbursement_simulated", "system", "Учебный симулятор выдачи: реальные деньги не переводились")
				return domain.Transition(app, "issued", "system", "Смоделированная выдача завершена")
			default:
				return bad("Неизвестное действие")
			}
			return nil
		})
		if e != nil {
			return e
		}
		return respond(w, 200, publicApplication(result, ac))
	}
}
func (a *API) subresource(resource string) endpoint {
	return func(w http.ResponseWriter, r *http.Request) error {
		v, e := a.accessible(r)
		if e != nil {
			return e
		}
		switch resource {
		case "offers":
			return respond(w, 200, v.Offers)
		case "timeline":
			return respond(w, 200, v.Events)
		case "checks":
			if e = require(r, "bank_analyst"); e != nil {
				return e
			}
			if len(v.Decisions) == 0 {
				return respond(w, 200, []domain.Check{})
			}
			return respond(w, 200, v.Decisions[len(v.Decisions)-1].Input.Checks)
		case "audit":
			if e = require(r, "bank_analyst"); e != nil {
				return e
			}
			return respond(w, 200, v.Events)
		default:
			pub := publicApplication(v, actor(r)).(map[string]any)
			return respond(w, 200, pub["decisions"])
		}
	}
}
func (a *API) cashflow(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	c, e := a.DB.Company(r.Context(), actor(r).CompanyID)
	if e != nil {
		return e
	}
	return respond(w, 200, domain.Aggregate(c))
}
func (a *API) forecast(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	var b struct {
		Horizon int `json:"horizon_days"`
	}
	if e := decode(r, &b); e != nil {
		return e
	}
	if b.Horizon != 30 && b.Horizon != 60 && b.Horizon != 90 {
		return bad("Горизонт 30, 60 или 90 дней")
	}
	c, e := a.DB.Company(r.Context(), actor(r).CompanyID)
	if e != nil {
		return e
	}
	return respond(w, 200, domain.ForecastCash(c, b.Horizon, 0, domain.Schedule{}))
}
func (a *API) simulate(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	v, e := a.accessible(r)
	if e != nil {
		return e
	}
	var p domain.Params
	if e = decode(r, &p); e != nil {
		return e
	}
	product, e := domain.Validate(p, domain.Products())
	if e != nil {
		return bad(e.Error())
	}
	c, e := a.DB.Company(r.Context(), v.CompanyID)
	if e != nil {
		return e
	}
	snap := domain.Snapshot{Company: c, Params: p, Product: product, Policy: domain.DefaultPolicy(), Documents: v.Documents, Checks: domain.MockChecks(c)}
	if len(v.Decisions) > 0 {
		snap = v.Decisions[len(v.Decisions)-1].Input
		snap.Params.Amount = p.Amount
		snap.Params.Term = p.Term
		snap.Params.Purpose = p.Purpose
		snap.Params.ProductID = p.ProductID
		snap.Product = product
	}
	// Never accept client-supplied financial facts as a what-if input.
	if len(v.Decisions) == 0 {
		snap.Params.DeclaredRevenue = v.Params.DeclaredRevenue
	}
	ev := domain.Evaluate(snap, true)
	for i := range ev.Rules {
		ev.Rules[i].Input = ""
		ev.Rules[i].Threshold = ""
	}
	forecast := domain.ForecastCash(snap.Company, 90, p.Amount, ev.Schedule)
	eligibility := ev.Outcome
	if eligibility == "offer" {
		eligibility = "eligible"
	}
	if eligibility == "decline" {
		eligibility = "ineligible"
	}
	return respond(w, 200, map[string]any{"scenario_id": domain.Hash(struct {
		Snapshot domain.Snapshot
		Params   domain.Params
	}{snap, p}), "evaluation": ev, "eligibility": eligibility, "monthly_payment_kopeks": ev.Schedule.MonthlyPayment, "total_cost_kopeks": ev.Schedule.TotalPayment, "coverage_ratio": ev.Coverage, "cash_gap_date": forecast.FundedGapDate, "forecast_min_balance_kopeks": forecast.FundedMin, "forecast": forecast, "alternatives": ev.Alternatives, "assumptions": forecast.Assumptions})
}
func (a *API) replay(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "bank_analyst"); e != nil {
		return e
	}
	v, e := a.accessible(r)
	if e != nil {
		return e
	}
	var b struct {
		DecisionID string `json:"decision_id"`
	}
	if e = decode(r, &b); e != nil {
		return e
	}
	if len(v.Decisions) == 0 {
		return bad("Решение ещё не сформировано")
	}
	d := v.Decisions[len(v.Decisions)-1]
	if b.DecisionID != "" {
		found := false
		for _, x := range v.Decisions {
			if x.ID == b.DecisionID {
				d = x
				found = true
			}
		}
		if !found {
			return bad("Решение не найдено")
		}
	}
	if d.EngineVersion != domain.EngineVersion {
		return respond(w, 200, map[string]any{"status": "cannot_replay", "match": false})
	}
	ev := domain.Evaluate(d.Input, true)
	match := domain.Hash(ev) == domain.Hash(d.Result) && domain.Hash(d.Input) == d.InputSHA
	diff := []string{}
	if !match {
		diff = append(diff, "Исходные данные или существенные результаты различаются")
	}
	return respond(w, 200, map[string]any{"status": "replayed", "match": match, "diff": diff, "decision_id": d.ID, "input_sha256": domain.Hash(d.Input), "ruleset_version": d.RulesetVersion, "result": ev})
}
func (a *API) reset(w http.ResponseWriter, r *http.Request) error {
	if !a.Demo || actor(r).Role != "demo_admin" {
		return forbidden()
	}
	var b struct {
		Confirm string `json:"confirm"`
	}
	if e := decode(r, &b); e != nil {
		return e
	}
	if b.Confirm != "RESET_SYNTHETIC_DATA" {
		return bad("Нужно явное подтверждение сброса синтетики")
	}
	if e := a.DB.Reset(r.Context()); e != nil {
		return e
	}
	return respond(w, 200, map[string]any{"reset": true, "seed": 2026})
}
func (a *API) metrics(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "bank_analyst"); e != nil {
		return e
	}
	var apps, decisions int
	_ = a.DB.Pool.QueryRow(r.Context(), `SELECT count(*) FROM credit_applications`).Scan(&apps)
	_ = a.DB.Pool.QueryRow(r.Context(), `SELECT count(*) FROM decision_runs`).Scan(&decisions)
	return respond(w, 200, map[string]any{"applications": apps, "decisions": decisions, "ai_enabled": false})
}
func (a *API) importCashflow(w http.ResponseWriter, r *http.Request) error {
	if e := require(r, "client"); e != nil {
		return e
	}
	var body struct {
		CSV string `json:"csv"`
	}
	if e := decode(r, &body); e != nil {
		return e
	}
	rows, e := domain.ParseCashflowCSV(actor(r).CompanyID, body.CSV)
	if e != nil {
		return bad(e.Error())
	}
	count, e := a.DB.ImportCashflow(r.Context(), actor(r).CompanyID, actor(r).ID, domain.Hash(body.CSV), rows)
	if e != nil {
		return e
	}
	return respond(w, 200, map[string]any{"imported_count": count, "duplicate_count": len(rows) - count, "source": "synthetic_csv", "snapshots_unchanged": true})
}
