package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	urlpkg "net/url"
	"os"
	"strings"
	"sync"
	"testing"

	"alfaflow/internal/domain"
	"alfaflow/internal/store"
	"github.com/jackc/pgx/v5"
)

type testClient struct {
	client     *http.Client
	base, csrf string
	t          *testing.T
}

func (c *testClient) req(method, path string, body any, key string) (int, []byte) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, c.base+"/api/v1"+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", c.csrf)
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	resp, e := c.client.Do(req)
	if e != nil {
		c.t.Fatal(e)
	}
	defer resp.Body.Close()
	var raw json.RawMessage
	if e = json.NewDecoder(resp.Body).Decode(&raw); e != nil {
		c.t.Fatal(e)
	}
	return resp.StatusCode, raw
}
func (c *testClient) login(p string) {
	code, b := c.req("POST", "/demo/session", map[string]any{"persona": p}, "")
	if code != 200 {
		c.t.Fatalf("login %d %s", code, b)
	}
	var v struct {
		CSRF string `json:"csrf_token"`
	}
	_ = json.Unmarshal(b, &v)
	c.csrf = v.CSRF
}
func (c *testClient) create(persona string, amount int64) domain.Application {
	c.login(persona)
	_, cb := c.req("GET", "/companies/me", nil, "")
	var co domain.Company
	_ = json.Unmarshal(cb, &co)
	p := domain.Params{ProductID: "WORKING_CAPITAL_LOAN", Purpose: "working_capital", Amount: amount, Term: 24, DeclaredRevenue: co.DeclaredRevenue}
	code, b := c.req("POST", "/applications", p, "")
	if code != 201 {
		c.t.Fatalf("create %d %s", code, b)
	}
	var a domain.Application
	_ = json.Unmarshal(b, &a)
	return a
}
func (c *testClient) action(a domain.Application, action string, body map[string]any, key string) domain.Application {
	body["version"] = a.Version
	code, b := c.req("POST", "/applications/"+a.ID+"/"+action, body, key)
	if code != 200 {
		c.t.Fatalf("%s: %d %s", action, code, b)
	}
	var result domain.Application
	_ = json.Unmarshal(b, &result)
	return result
}

func TestPostgresCreditPipeline(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL не задан; integration требует реальный PostgreSQL")
	}
	connection, e := pgx.Connect(context.Background(), url)
	if e != nil {
		t.Fatal(e)
	}
	schemaName := "test_" + strings.ReplaceAll(domain.ID(), "-", "")
	if _, e = connection.Exec(context.Background(), `CREATE SCHEMA `+schemaName); e != nil {
		t.Fatal(e)
	}
	defer func() {
		_, _ = connection.Exec(context.Background(), `DROP SCHEMA `+schemaName+` CASCADE`)
		_ = connection.Close(context.Background())
	}()
	parsedURL, _ := urlpkg.Parse(url)
	query := parsedURL.Query()
	query.Set("search_path", schemaName)
	parsedURL.RawQuery = query.Encode()
	testURL := parsedURL.String()
	db, e := store.Open(context.Background(), testURL)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Pool.Close()
	if e = db.Seed(context.Background()); e != nil {
		t.Fatal(e)
	}
	srv := httptest.NewServer(New(db, true))
	defer srv.Close()
	client := func() *testClient {
		jar, _ := cookiejar.New(nil)
		return &testClient{&http.Client{Jar: jar}, srv.URL, "", t}
	}
	c := client()
	bank := client()
	bank.login("BANK")
	t.Run("A_issue_idempotency_restart_RBAC", func(t *testing.T) {
		a := c.create("A_APPROVED", 100000000)
		draft := a
		a = c.action(a, "submit", map[string]any{"consent": true}, "submit-"+a.ID)
		if a.Status != "offer_issued" {
			t.Fatal(a.Status)
		}
		again := c.action(draft, "submit", map[string]any{"consent": true}, "submit-"+a.ID)
		if again.Version != a.Version {
			t.Fatal("duplicate submit")
		}
		code, _ := c.req("POST", "/applications/"+a.ID+"/submit", map[string]any{"version": draft.Version, "consent": false}, "submit-"+a.ID)
		if code != 409 {
			t.Fatal("idempotency body conflict", code)
		}
		offer := a.Offers[len(a.Offers)-1]
		old := a
		a = c.action(a, "offers/"+offer.ID+"/accept", map[string]any{"consent": true}, "accept-"+a.ID)
		again = c.action(old, "offers/"+offer.ID+"/accept", map[string]any{"consent": true}, "accept-"+a.ID)
		if again.Version != a.Version {
			t.Fatal("duplicate accept")
		}
		old = a
		a = c.action(a, "sign-simulated", map[string]any{"consent": true}, "sign-"+a.ID)
		again = c.action(old, "sign-simulated", map[string]any{"consent": true}, "sign-"+a.ID)
		if a.Status != "issued" || again.DisbursementID != a.DisbursementID {
			t.Fatal("issue")
		}
		var n int
		_ = db.Pool.QueryRow(context.Background(), `SELECT count(*) FROM simulated_disbursements WHERE application_id=$1`, a.ID).Scan(&n)
		if n != 1 {
			t.Fatal("duplicate disbursement")
		}
		// New service/store instance reads committed state, not process memory.
		reopened, e := store.Open(context.Background(), testURL)
		if e != nil {
			t.Fatal(e)
		}
		persisted, e := reopened.Get(context.Background(), a.ID)
		reopened.Pool.Close()
		if e != nil || persisted.Status != "issued" {
			t.Fatal("persistence")
		}
		foreign := client()
		foreign.login("B_COUNTEROFFER")
		code, _ = foreign.req("GET", "/applications/"+a.ID, nil, "")
		if code != 403 {
			t.Fatal("IDOR", code)
		}
		code, _ = c.req("POST", "/bank/applications/"+a.ID+"/decide", map[string]any{"version": a.Version, "decision": "offer", "reason": "forged actor"}, "forged")
		if code != 403 {
			t.Fatal("RBAC", code)
		}
		code, b := bank.req("POST", "/bank/applications/"+a.ID+"/decision-passport/replay", map[string]any{}, "")
		var replay struct {
			Match bool `json:"match"`
		}
		_ = json.Unmarshal(b, &replay)
		if code != 200 || !replay.Match {
			t.Fatalf("replay %d %s", code, b)
		}
	})
	t.Run("C_request_correct_resubmit", func(t *testing.T) {
		a := c.create("C_NEEDS_INFO", 100000000)
		a = c.action(a, "submit", map[string]any{"consent": true}, domain.ID())
		if a.Status != "needs_info" {
			t.Fatal(a.Status)
		}
		code, b := bank.req("POST", "/bank/applications/"+a.ID+"/request-info", map[string]any{"version": a.Version, "message": "Подтвердите оборот данными выписки."}, domain.ID())
		if code != 200 {
			t.Fatalf("request %d %s", code, b)
		}
		_ = json.Unmarshal(b, &a)
		req := a.InfoRequests[len(a.InfoRequests)-1]
		a = c.action(a, "provide-info", map[string]any{"consent": true, "request_id": req.ID, "answer": "Исправлен оборот по синтетической выписке", "declared_revenue_kopeks": 300000000}, domain.ID())
		if a.Status != "offer_issued" || len(a.Revisions) != 2 {
			t.Fatal(a.Status, len(a.Revisions))
		}
	})
	t.Run("B_whatif_immutable_offer_revision", func(t *testing.T) {
		a := c.create("B_COUNTEROFFER", 500000000)
		a = c.action(a, "submit", map[string]any{"consent": true}, domain.ID())
		if a.Status != "offer_issued" || a.Offers[0].Type != "counteroffer" {
			t.Fatal(a.Status)
		}
		p := a.Offers[0].Params
		code, b := c.req("POST", "/applications/"+a.ID+"/simulations", p, "")
		if code != 200 {
			t.Fatalf("sim %d %s", code, b)
		}
		check, _ := db.Get(context.Background(), a.ID)
		if check.Version != a.Version {
			t.Fatal("simulation mutated")
		}
		body := map[string]any{"product_id": p.ProductID, "purpose": p.Purpose, "amount_kopeks": p.Amount, "term_months": p.Term, "declared_revenue_kopeks": p.DeclaredRevenue}
		a = c.action(a, "request-offer", body, domain.ID())
		if len(a.Offers) != 2 || a.Params.Amount != 500000000 {
			t.Fatal("revision lost original")
		}
	})
	t.Run("D_no_bypass", func(t *testing.T) {
		a := c.create("D_DECLINED", 100000000)
		a = c.action(a, "submit", map[string]any{"consent": true}, domain.ID())
		if a.Status != "declined" {
			t.Fatal(a.Status)
		}
		p := a.Params
		p.Amount = 10000000
		code, b := c.req("POST", "/applications/"+a.ID+"/simulations", p, "")
		if code != 200 {
			t.Fatal(code)
		}
		var sim struct {
			Eligibility  string `json:"eligibility"`
			Alternatives []any  `json:"alternatives"`
		}
		_ = json.Unmarshal(b, &sim)
		if sim.Eligibility != "ineligible" || len(sim.Alternatives) != 0 {
			t.Fatalf("hard stop %s", b)
		}
		code, _ = c.req("POST", "/applications/"+a.ID+"/sign-simulated", map[string]any{"version": a.Version, "consent": true}, domain.ID())
		if code != 409 {
			t.Fatal("state bypass", code)
		}
	})
	t.Run("E_bank_manual", func(t *testing.T) {
		a := c.create("E_MANUAL_REVIEW", 100000000)
		a = c.action(a, "submit", map[string]any{"consent": true}, domain.ID())
		if a.Status != "manual_review" {
			t.Fatal(a.Status)
		}
		code, b := bank.req("POST", "/bank/applications/"+a.ID+"/decide", map[string]any{"version": a.Version, "decision": "offer", "reason": "Учебная проверка завершена; исключение БКИ принято аналитиком."}, domain.ID())
		if code != 200 {
			t.Fatalf("manual %d %s", code, b)
		}
	})
	t.Run("concurrency_and_atomic_rollback", func(t *testing.T) {
		a := c.create("A_APPROVED", 100000000)
		var wg sync.WaitGroup
		codes := make(chan int, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				code, _ := c.req("POST", "/applications/"+a.ID+"/submit", map[string]any{"version": a.Version, "consent": true}, "concurrent-"+a.ID)
				codes <- code
			}()
		}
		wg.Wait()
		close(codes)
		for code := range codes {
			if code != 200 {
				t.Fatal(code)
			}
		}
		current, _ := db.Get(context.Background(), a.ID)
		before := domain.Hash(current)
		_, err := db.Mutate(context.Background(), a.ID, domain.StableID(100), "rollback", domain.ID(), "test", current.Version, func(v *domain.Application) error {
			domain.AddEvent(v, "should_rollback", "test", "test")
			return bad("intentional")
		})
		if err == nil {
			t.Fatal("expected error")
		}
		after, _ := db.Get(context.Background(), a.ID)
		if before != domain.Hash(after) {
			t.Fatal("rollback failed")
		}
	})
	t.Run("invalid_json_csrf_upload", func(t *testing.T) {
		a := c.create("A_APPROVED", 100000000)
		for _, body := range []any{nil, map[string]any{}, map[string]any{"amount_kopeks": "NaN"}, map[string]any{"role": "bank_analyst"}} {
			code, _ := c.req("POST", "/applications", body, "")
			if code < 400 || code >= 500 {
				t.Fatal("invalid body", code)
			}
		}
		req, _ := http.NewRequest("POST", srv.URL+"/api/v1/applications", bytes.NewBufferString("{}"))
		resp, e := c.client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		resp.Body.Close()
		if resp.StatusCode != 403 {
			t.Fatal("csrf")
		}
		code, _ := c.req("POST", "/applications/"+a.ID+"/documents", map[string]any{"version": a.Version, "kind": "statement", "name": "../bad.txt", "synthetic": true}, domain.ID())
		if code != 422 {
			t.Fatal("path", code)
		}
	})
	t.Run("csv_import_isolation_dedupe_snapshot", func(t *testing.T) {
		a := c.create("A_APPROVED", 100000000)
		a = c.action(a, "submit", map[string]any{"consent": true}, domain.ID())
		before := a.Decisions[0].InputSHA
		csv := "date,amount,currency,direction,category,description\n2026-09-10,123.45,RUB,credit,sales,<script>alert(1)</script>\n"
		for i, want := range []int{1, 0} {
			code, b := c.req("POST", "/companies/me/cashflow/import", map[string]any{"csv": csv}, "")
			var result struct {
				Imported int `json:"imported_count"`
			}
			_ = json.Unmarshal(b, &result)
			if code != 200 || result.Imported != want {
				t.Fatalf("import %d %d %s", i, code, b)
			}
		}
		stored, _ := db.Get(context.Background(), a.ID)
		if stored.Decisions[0].InputSHA != before {
			t.Fatal("historical snapshot mutated")
		}
		_, b := bank.req("POST", "/bank/applications/"+a.ID+"/decision-passport/replay", map[string]any{}, "")
		var replay struct {
			Match bool `json:"match"`
		}
		_ = json.Unmarshal(b, &replay)
		if !replay.Match {
			t.Fatal("import broke replay")
		}
		code, _ := bank.req("POST", "/companies/me/cashflow/import", map[string]any{"csv": csv}, "")
		if code != 403 {
			t.Fatal("bank import RBAC", code)
		}
		code, _ = c.req("POST", "/companies/me/cashflow/import", map[string]any{"csv": "bad"}, "")
		if code != 422 {
			t.Fatal("invalid CSV", code)
		}
	})
	t.Run("immutability_upload_limits_and_malformed_uuid", func(t *testing.T) {
		a := c.create("A_APPROVED", 100000000)
		code, _ := c.req("GET", "/applications/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", nil, "")
		if code != 404 {
			t.Fatal("malformed uuid", code)
		}
		code, _ = c.req("POST", "/applications/"+a.ID+"/documents", map[string]any{"version": a.Version, "kind": "statement", "name": "bad.pdf", "content_base64": "bm90IHBkZg=="}, domain.ID())
		if code != 422 {
			t.Fatal("PDF sniff", code)
		}
		a = c.action(a, "submit", map[string]any{"consent": true}, domain.ID())
		_, err := db.Pool.Exec(context.Background(), `UPDATE decision_runs SET data='{}' WHERE id=$1`, a.Decisions[0].ID)
		if err == nil {
			t.Fatal("append-only trigger must reject UPDATE")
		}
		code, b := c.req("GET", "/applications/"+a.ID+"/decision-passport", nil, "")
		if code != 200 || bytes.Contains(b, []byte("input_snapshot_json")) || bytes.Contains(b, []byte("threshold")) {
			t.Fatal("client internal policy leak")
		}
		p := a.Offers[0].Params
		forged := map[string]any{"version": a.Version, "product_id": p.ProductID, "purpose": p.Purpose, "amount_kopeks": p.Amount, "term_months": p.Term, "declared_revenue_kopeks": 999999999999}
		a = c.action(a, "request-offer", forged, domain.ID())
		stored, _ := db.Get(context.Background(), a.ID)
		if stored.Decisions[len(stored.Decisions)-1].Input.Params.DeclaredRevenue != 300000000 {
			t.Fatal("offer facts modified")
		}
	})
	t.Run("DB_failure_mid_transition_rolls_back_all", func(t *testing.T) {
		a := c.create("A_APPROVED", 100000000)
		_, e := db.Pool.Exec(context.Background(), `CREATE FUNCTION reject_rollback_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.data->>'type'='rollback_probe' THEN RAISE EXCEPTION 'intentional mid-write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_rollback_probe BEFORE INSERT ON application_events FOR EACH ROW EXECUTE FUNCTION reject_rollback_probe();`)
		if e != nil {
			t.Fatal(e)
		}
		defer db.Pool.Exec(context.Background(), `DROP TRIGGER reject_rollback_probe ON application_events; DROP FUNCTION reject_rollback_probe();`)
		before := domain.Hash(a)
		_, e = db.Mutate(context.Background(), a.ID, domain.StableID(100), "db-rollback", domain.ID(), "probe", a.Version, func(v *domain.Application) error {
			v.Params.Amount = 200000000
			domain.AddEvent(v, "rollback_probe", "test", "fail after application UPDATE")
			return nil
		})
		if e == nil {
			t.Fatal("expected SQL error")
		}
		stored, _ := db.Get(context.Background(), a.ID)
		if domain.Hash(stored) != before {
			t.Fatal("partial state committed")
		}
		var n int
		_ = db.Pool.QueryRow(context.Background(), `SELECT count(*) FROM application_events WHERE application_id=$1 AND data->>'type'='rollback_probe'`, a.ID).Scan(&n)
		if n != 0 {
			t.Fatal("event committed")
		}
	})
}
