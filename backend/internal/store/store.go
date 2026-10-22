package store

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"alfaflow/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var Schema string
var ErrConflict = errors.New("версия устарела; обновите страницу")
var ErrIdempotency = errors.New("ключ идемпотентности уже использован с другим запросом")

type Store struct{ Pool *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Store, error) {
	p, e := pgxpool.New(ctx, url)
	if e != nil {
		return nil, e
	}
	s := &Store{p}
	if e = p.Ping(ctx); e != nil {
		return nil, e
	}
	if _, e = p.Exec(ctx, Schema); e != nil {
		return nil, e
	}
	return s, nil
}
func js(v any) []byte { b, _ := json.Marshal(v); return b }
func (s *Store) Seed(ctx context.Context) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(2026)`)
	if e != nil {
		return e
	}
	var n int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM companies`).Scan(&n)
	if n > 0 {
		return tx.Commit(ctx)
	}
	for i, c := range domain.SeedCompanies() {
		if _, e = tx.Exec(ctx, `INSERT INTO companies VALUES($1,$2)`, c.ID, js(c)); e != nil {
			return e
		}
		u := domain.StableID(100 + i)
		if _, e = tx.Exec(ctx, `INSERT INTO users VALUES($1,$2,'client',$3)`, u, c.Contact, c.Persona); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO memberships VALUES($1,$2)`, u, c.ID); e != nil {
			return e
		}
		for _, t := range c.Transactions {
			if _, e = tx.Exec(ctx, `INSERT INTO financial_transactions VALUES($1,$2,$3)`, t.ID, c.ID, js(t)); e != nil {
				return e
			}
		}
		p := domain.Params{ProductID: "WORKING_CAPITAL_LOAN", Purpose: "working_capital", Amount: 100000000, Term: 24, DeclaredRevenue: c.DeclaredRevenue}
		if i == 1 {
			p.Amount = 500000000
			p.Term = 12
		}
		a := domain.NewDraft(c, p)
		// Keep flagship A draft for the complete client path; queue has persisted outcomes.
		if i > 0 {
			a.Revisions = append(a.Revisions, domain.Revision{Version: 1, Params: p, Documents: []domain.Document{}, At: time.Now().UTC()})
			_ = domain.Transition(&a, "submitted", "system", "Seed: заявка отправлена")
			_ = domain.Transition(&a, "validating", "system", "Синтетические проверки")
			_ = domain.Transition(&a, "scoring", "system", "Расчёт правил")
			d := domain.RunDecision(&a, c, domain.Products()[0], "system", "", "")
			if e = domain.ApplyDecision(&a, d, "system"); e != nil {
				return e
			}
		}
		if e = save(ctx, tx, a, true); e != nil {
			return e
		}
	}
	for _, v := range []domain.Actor{{ID: domain.StableID(900), Name: "Аналитик демо-банка", Role: "bank_analyst", Persona: "BANK"}, {ID: domain.StableID(901), Name: "Администратор демо", Role: "demo_admin", Persona: "ADMIN"}} {
		if _, e = tx.Exec(ctx, `INSERT INTO users VALUES($1,$2,$3,$4)`, v.ID, v.Name, v.Role, v.Persona); e != nil {
			return e
		}
	}
	for _, p := range domain.Products() {
		if _, e = tx.Exec(ctx, `INSERT INTO loan_products VALUES($1,$2)`, p.ID, js(p)); e != nil {
			return e
		}
	}
	policy := domain.DefaultPolicy()
	if _, e = tx.Exec(ctx, `INSERT INTO rule_sets VALUES($1,$2,$3)`, policy.ID, policy.Version, js(policy)); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Company(ctx context.Context, id string) (domain.Company, error) {
	var c domain.Company
	var b []byte
	e := s.Pool.QueryRow(ctx, `SELECT data FROM companies WHERE id=$1`, id).Scan(&b)
	if e == nil {
		e = json.Unmarshal(b, &c)
	}
	return c, e
}
func (s *Store) Companies(ctx context.Context) ([]domain.Company, error) {
	rows, e := s.Pool.Query(ctx, `SELECT data FROM companies ORDER BY id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	cs := []domain.Company{}
	for rows.Next() {
		var b []byte
		var c domain.Company
		if e = rows.Scan(&b); e != nil {
			return nil, e
		}
		_ = json.Unmarshal(b, &c)
		cs = append(cs, c)
	}
	return cs, rows.Err()
}
func (s *Store) Persona(ctx context.Context, persona string) (domain.Actor, error) {
	a := domain.Actor{}
	e := s.Pool.QueryRow(ctx, `SELECT u.id,u.name,u.role,u.persona,COALESCE(m.company_id::text,'') FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE u.persona=$1`, persona).Scan(&a.ID, &a.Name, &a.Role, &a.Persona, &a.CompanyID)
	return a, e
}
func tokenHash(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }
func (s *Store) Session(ctx context.Context, token string) (domain.Actor, error) {
	var b []byte
	var a domain.Actor
	e := s.Pool.QueryRow(ctx, `SELECT actor FROM sessions WHERE token_hash=$1 AND expires_at>now()`, tokenHash(token)).Scan(&b)
	if e == nil {
		e = json.Unmarshal(b, &a)
	}
	return a, e
}
func (s *Store) Login(ctx context.Context, a domain.Actor) (string, error) {
	token := domain.ID() + domain.ID()
	_, e := s.Pool.Exec(ctx, `INSERT INTO sessions VALUES($1,$2,$3)`, tokenHash(token), js(a), time.Now().UTC().Add(12*time.Hour))
	return token, e
}
func (s *Store) Get(ctx context.Context, id string) (domain.Application, error) {
	var a domain.Application
	var b []byte
	e := s.Pool.QueryRow(ctx, `SELECT data FROM credit_applications WHERE id=$1`, id).Scan(&b)
	if e == nil {
		e = json.Unmarshal(b, &a)
	}
	return a, e
}
func (s *Store) List(ctx context.Context, company, status string, limit, offset int) ([]domain.Application, error) {
	rows, e := s.Pool.Query(ctx, `SELECT data FROM credit_applications WHERE ($1='' OR company_id::text=$1) AND ($2='' OR status=$2) ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4`, company, status, limit, offset)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	all := []domain.Application{}
	for rows.Next() {
		var b []byte
		var a domain.Application
		if e = rows.Scan(&b); e != nil {
			return nil, e
		}
		_ = json.Unmarshal(b, &a)
		all = append(all, a)
	}
	return all, rows.Err()
}
func (s *Store) Create(ctx context.Context, a domain.Application) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = save(ctx, tx, a, true); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

// Lock application first; idempotency lookup inside the same serializable business critical section.
func (s *Store) Mutate(ctx context.Context, id, actor, action, key, hash string, version int, fn func(*domain.Application) error) (domain.Application, error) {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return domain.Application{}, e
	}
	defer tx.Rollback(ctx)
	var b []byte
	if e = tx.QueryRow(ctx, `SELECT data FROM credit_applications WHERE id=$1 FOR UPDATE`, id).Scan(&b); e != nil {
		return domain.Application{}, e
	}
	var a domain.Application
	_ = json.Unmarshal(b, &a)
	if key != "" {
		var oldHash string
		var response []byte
		err := tx.QueryRow(ctx, `SELECT request_hash,response FROM idempotency_keys WHERE actor_id=$1 AND action=$2 AND key=$3`, actor, action, key).Scan(&oldHash, &response)
		if err == nil {
			if oldHash != hash {
				return a, ErrIdempotency
			}
			_ = json.Unmarshal(response, &a)
			return a, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return a, err
		}
	}
	if version != a.Version {
		return a, ErrConflict
	}
	if e = fn(&a); e != nil {
		return a, e
	}
	a.Version++
	a.UpdatedAt = time.Now().UTC()
	if e = save(ctx, tx, a, false); e != nil {
		return a, e
	}
	if key != "" {
		if _, e = tx.Exec(ctx, `INSERT INTO idempotency_keys VALUES($1,$2,$3,$4,$5)`, actor, action, key, hash, js(a)); e != nil {
			return a, e
		}
	}
	if e = tx.Commit(ctx); e != nil {
		return a, e
	}
	return a, nil
}
func save(ctx context.Context, tx pgx.Tx, a domain.Application, create bool) error {
	var e error
	if create {
		_, e = tx.Exec(ctx, `INSERT INTO credit_applications VALUES($1,$2,$3,$4,$5,$6,$7)`, a.ID, a.CompanyID, a.Status, a.Version, js(a), a.CreatedAt, a.UpdatedAt)
	} else {
		_, e = tx.Exec(ctx, `UPDATE credit_applications SET status=$2,version=$3,data=$4,updated_at=$5 WHERE id=$1`, a.ID, a.Status, a.Version, js(a), a.UpdatedAt)
	}
	if e != nil {
		return e
	}
	insert := func(table, id string, v any) error {
		_, err := tx.Exec(ctx, fmt.Sprintf(`INSERT INTO %s(id,application_id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, table), id, a.ID, js(v))
		return err
	}
	for _, r := range a.Revisions {
		if _, e = tx.Exec(ctx, `INSERT INTO application_revisions VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, a.ID, r.Version, js(r)); e != nil {
			return e
		}
	}
	for _, d := range a.Documents {
		if e = insert("documents", d.ID, d); e != nil {
			return e
		}
	}
	for _, d := range a.Decisions {
		if e = insert("decision_runs", d.ID, d); e != nil {
			return e
		}
		if e = insert("financial_snapshots", d.ID, d.Input); e != nil {
			return e
		}
		if e = insert("score_runs", d.ID, d.Result); e != nil {
			return e
		}
		for _, c := range d.Input.Checks {
			if e = insert("external_check_runs", c.ID, c); e != nil {
				return e
			}
		}
	}
	for _, o := range a.Offers {
		if _, e = tx.Exec(ctx, `INSERT INTO loan_offers VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, o.ID, a.ID, o.Revision, js(o)); e != nil {
			return e
		}
	}
	for _, v := range a.Events {
		if e = insert("application_events", v.ID, v); e != nil {
			return e
		}
		if e = insert("audit_logs", v.ID, v); e != nil {
			return e
		}
		if e = insert("notifications", v.ID, v); e != nil {
			return e
		}
	}
	if a.DisbursementID != "" {
		_, e = tx.Exec(ctx, `INSERT INTO simulated_disbursements(id,application_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, a.DisbursementID, a.ID)
	}
	return e
}
func (s *Store) Reset(ctx context.Context) error {
	// Explicit admin-only reset of synthetic schema, not filesystem or real customer data.
	_, e := s.Pool.Exec(ctx, `TRUNCATE cashflow_imports,idempotency_keys,simulated_disbursements,notifications,audit_logs,application_events,loan_offers,decision_runs,score_runs,external_check_runs,financial_snapshots,documents,application_revisions,credit_applications,financial_transactions,memberships,sessions,users,companies,loan_products,rule_sets CASCADE`)
	if e != nil {
		return e
	}
	return s.Seed(ctx)
}

func (s *Store) ImportCashflow(ctx context.Context, companyID, actorID, hash string, rows []domain.Transaction) (int, error) {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return 0, e
	}
	defer tx.Rollback(ctx)
	var raw []byte
	if e = tx.QueryRow(ctx, `SELECT data FROM companies WHERE id=$1 FOR UPDATE`, companyID).Scan(&raw); e != nil {
		return 0, e
	}
	var c domain.Company
	_ = json.Unmarshal(raw, &c)
	if len(c.Transactions)+len(rows) > 5000 {
		return 0, fmt.Errorf("лимит демо-истории 5000 операций; используйте reset для нового эксперимента")
	}
	count := 0
	for _, row := range rows {
		tag, err := tx.Exec(ctx, `INSERT INTO financial_transactions VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, row.ID, companyID, js(row))
		if err != nil {
			return 0, err
		}
		if tag.RowsAffected() > 0 {
			c.Transactions = append(c.Transactions, row)
			count++
		}
	}
	months := map[string]map[string]bool{}
	for _, t := range c.Transactions {
		month := t.Date[:7]
		if months[month] == nil {
			months[month] = map[string]bool{}
		}
		months[month][t.Date] = true
	}
	c.HistoryMonths = 0
	for _, days := range months {
		if len(days) >= 20 {
			c.HistoryMonths++
		}
	}
	sort.SliceStable(c.Transactions, func(i, j int) bool { return c.Transactions[i].Date < c.Transactions[j].Date })
	if _, e = tx.Exec(ctx, `UPDATE companies SET data=$2 WHERE id=$1`, c.ID, js(c)); e != nil {
		return 0, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO cashflow_imports(id,company_id,actor_id,imported_count,source_sha256) VALUES($1,$2,$3,$4,$5)`, domain.ID(), companyID, actorID, count, hash); e != nil {
		return 0, e
	}
	return count, tx.Commit(ctx)
}
