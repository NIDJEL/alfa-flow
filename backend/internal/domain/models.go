package domain

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

const EngineVersion = "deterministic-1.0"

func ID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func StableID(n int) string { return fmt.Sprintf("20260000-0000-4000-8000-%012d", n) }
func Hash(v any) string {
	b, _ := json.Marshal(v) // structs have fixed fields, map keys sorted by encoding/json
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
func HashBytes(b []byte)string {
	h:=sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

type Actor struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CompanyID string `json:"company_id,omitempty"`
	Persona   string `json:"persona"`
}

type Company struct {
	ID              string        `json:"id"`
	Name            string        `json:"name"`
	Persona         string        `json:"persona"`
	TaxID           string        `json:"tax_id"`
	Contact         string        `json:"contact"`
	LegalStatus     string        `json:"legal_status"`
	BKI             string        `json:"bki"`
	OverdueDays     int           `json:"overdue_days"`
	Authorized      bool          `json:"authorized"`
	OpeningBalance  int64         `json:"opening_balance_kopeks"`
	DeclaredRevenue int64         `json:"declared_revenue_kopeks"`
	HistoryMonths   int           `json:"history_months"`
	Commitments     []Commitment  `json:"commitments"`
	Transactions    []Transaction `json:"transactions"`
}

type Transaction struct {
	ID          string `json:"id"`
	Date        string `json:"date"`
	Amount      int64  `json:"amount_kopeks"`
	Direction   string `json:"direction"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Recurring   bool   `json:"recurring"`
	Currency    string `json:"currency"`
}

type Commitment struct {
	Date        string `json:"date"`
	Amount      int64  `json:"amount_kopeks"`
	Description string `json:"description"`
}

type Product struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Version          string `json:"version"`
	APRBP            int64  `json:"apr_basis_points"`
	MinAmount        int64  `json:"min_amount_kopeks"`
	MaxAmount        int64  `json:"max_amount_kopeks"`
	MinTerm          int    `json:"min_term_months"`
	MaxTerm          int    `json:"max_term_months"`
	Purpose          string `json:"purpose"`
	RequiredDocument string `json:"required_document,omitempty"`
	Fee              int64  `json:"fee_kopeks"`
}

func Products() []Product {
	return []Product{
		{"WORKING_CAPITAL_LOAN", "Оборотный кредит", "2026-demo-v1", 2200, 10000000, 500000000, 6, 36, "working_capital", "", 0},
		{"EQUIPMENT_LOAN", "Кредит на оборудование", "2026-demo-v1", 1900, 30000000, 1000000000, 12, 48, "equipment", "equipment_invoice", 0},
	}
}

type Params struct {
	ProductID       string `json:"product_id"`
	Purpose         string `json:"purpose"`
	Amount          int64  `json:"amount_kopeks"`
	Term            int    `json:"term_months"`
	DeclaredRevenue int64  `json:"declared_revenue_kopeks"`
}

type Document struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Name      string    `json:"name"`
	SHA256    string    `json:"sha256"`
	Size      int       `json:"size_bytes"`
	Source    string    `json:"source"`
	CreatedAt time.Time `json:"created_at"`
}
type Check struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Status   string `json:"status"`
	Source   string `json:"source"`
	Detail   string `json:"detail"`
}
type Event struct {
	ID    string    `json:"id"`
	Type  string    `json:"type"`
	From  string    `json:"from"`
	To    string    `json:"to"`
	Actor string    `json:"actor"`
	Note  string    `json:"note"`
	At    time.Time `json:"at"`
}
type InfoRequest struct {
	ID      string `json:"id"`
	Message string `json:"message"`
	Open    bool   `json:"open"`
	Answer  string `json:"answer,omitempty"`
}
type Revision struct {
	Version   int        `json:"version"`
	Params    Params     `json:"params"`
	Documents []Document `json:"documents"`
	At        time.Time  `json:"at"`
}
type Offer struct {
	ID         string    `json:"id"`
	Revision   int       `json:"revision"`
	Type       string    `json:"type"`
	Params     Params    `json:"params"`
	Schedule   Schedule  `json:"schedule"`
	DecisionID string    `json:"decision_id"`
	ExpiresAt  time.Time `json:"expires_at"`
	CreatedAt  time.Time `json:"created_at"`
}
type Application struct {
	ID              string        `json:"id"`
	CompanyID       string        `json:"company_id"`
	CompanyName     string        `json:"company_name"`
	Persona         string        `json:"persona"`
	Status          string        `json:"status"`
	Version         int           `json:"version"`
	Params          Params        `json:"params"`
	Documents       []Document    `json:"documents"`
	Revisions       []Revision    `json:"revisions"`
	Decisions       []Decision    `json:"decisions"`
	Offers          []Offer       `json:"offers"`
	ActiveOfferID   string        `json:"active_offer_id,omitempty"`
	AcceptedOfferID string        `json:"accepted_offer_id,omitempty"`
	Events          []Event       `json:"events"`
	InfoRequests    []InfoRequest `json:"info_requests"`
	DisbursementID  string        `json:"disbursement_id,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

var graph = map[string][]string{
	"draft": {"submitted", "closed"}, "submitted": {"validating"},
	"validating": {"needs_info", "scoring", "manual_review"},
	"scoring":    {"offer_issued", "manual_review", "declined", "needs_info"},
	"needs_info": {"validating"}, "manual_review": {"needs_info", "offer_issued", "declined"},
	"offer_issued":   {"offer_accepted", "closed", "offer_issued"},
	"offer_accepted": {"signing_simulated"}, "signing_simulated": {"issued"},
}

func CanTransition(from, to string) bool {
	for _, s := range graph[from] {
		if s == to {
			return true
		}
	}
	return false
}
func Transition(a *Application, to, actor, note string) error {
	if !CanTransition(a.Status, to) {
		return fmt.Errorf("переход %s → %s запрещён", a.Status, to)
	}
	a.Events = append(a.Events, Event{ID(), "status_changed", a.Status, to, actor, note, time.Now().UTC()})
	a.Status = to
	return nil
}
func AddEvent(a *Application, kind, actor, note string) {
	a.Events = append(a.Events, Event{ID(), kind, a.Status, a.Status, actor, note, time.Now().UTC()})
}

func Validate(p Params, products []Product) (Product, error) {
	for _, product := range products {
		if product.ID != p.ProductID {
			continue
		}
		if p.Amount < product.MinAmount || p.Amount > product.MaxAmount {
			return product, fmt.Errorf("сумма вне допустимого диапазона продукта")
		}
		if p.Term < product.MinTerm || p.Term > product.MaxTerm {
			return product, fmt.Errorf("срок вне допустимого диапазона продукта")
		}
		if p.Purpose != product.Purpose {
			return product, fmt.Errorf("цель не соответствует продукту")
		}
		if p.DeclaredRevenue < 0 || p.DeclaredRevenue > 1000000000000 {
			return product, fmt.Errorf("некорректный оборот")
		}
		return product, nil
	}
	return Product{}, fmt.Errorf("неизвестный продукт")
}
