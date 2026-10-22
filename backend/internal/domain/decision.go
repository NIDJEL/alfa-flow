package domain

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"time"
)

//go:embed policy_v1.json
var policyJSON []byte

type Policy struct {
	ID               string `json:"id"`
	Version          string `json:"version"`
	MinCoverage      int64  `json:"min_coverage_basis_points"`
	MediumCoverage   int64  `json:"medium_coverage_basis_points"`
	MaxOverdue       int    `json:"max_overdue_days"`
	MinHistory       int    `json:"min_history_months"`
	RevenueTolerance int64  `json:"revenue_tolerance_basis_points"`
	Description      string `json:"description"`
}

func DefaultPolicy() Policy { var p Policy; _ = json.Unmarshal(policyJSON, &p); return p }

type Rule struct {
	ID        string `json:"id"`
	Message   string `json:"message"`
	Input     string `json:"input,omitempty"`
	Threshold string `json:"threshold,omitempty"`
}
type Alternative struct {
	Params   Params   `json:"params"`
	Schedule Schedule `json:"schedule"`
	Coverage *float64 `json:"coverage_ratio"`
	Reason   string   `json:"reason"`
}
type Evaluation struct {
	Outcome       string        `json:"outcome"`
	RiskBand      string        `json:"risk_band"`
	Rules         []Rule        `json:"triggered_rules"`
	Schedule      Schedule      `json:"schedule"`
	Coverage      *float64      `json:"coverage_ratio"`
	AvailableCash int64         `json:"available_cash_kopeks"`
	ExistingDebt  int64         `json:"existing_debt_kopeks"`
	Alternatives  []Alternative `json:"alternatives"`
}
type Snapshot struct {
	Company      Company    `json:"company"`
	Params       Params     `json:"params"`
	Product      Product    `json:"product"`
	Documents    []Document `json:"documents"`
	Checks       []Check    `json:"mock_checks"`
	Policy       Policy     `json:"policy"`
	ManualAction string     `json:"manual_action,omitempty"`
	ManualReason string     `json:"manual_reason,omitempty"`
}
type Decision struct {
	ID                  string     `json:"decision_id"`
	ApplicationRevision int        `json:"application_revision"`
	Input               Snapshot   `json:"input_snapshot_json"`
	InputSHA            string     `json:"input_sha256"`
	RulesetVersion      string     `json:"ruleset_version"`
	ProductVersion      string     `json:"product_version"`
	EngineVersion       string     `json:"engine_version"`
	Result              Evaluation `json:"result"`
	Actor               string     `json:"actor"`
	CreatedAt           time.Time  `json:"created_at"`
}

func MockChecks(c Company) []Check {
	return []Check{
		{ID(), "registry", c.LegalStatus, "simulated", "Синтетический реестр: " + c.LegalStatus},
		{ID(), "bki", c.BKI, "simulated", fmt.Sprintf("Учебная БКИ: %s; просрочка %d дней", c.BKI, c.OverdueDays)},
		{ID(), "authority", "checked", "simulated", fmt.Sprintf("Полномочия представителя: %t", c.Authorized)},
	}
}
func Evaluate(s Snapshot, alternatives bool) Evaluation {
	if s.ManualAction == "decline" {
		base := s
		base.ManualAction = ""
		r := Evaluate(base, alternatives)
		r.Outcome = "decline"
		r.Rules = append(r.Rules, Rule{"MANUAL_DECLINE", "Специалист принял мотивированное решение.", s.ManualReason, ""})
		return r
	}
	r := Evaluation{Outcome: "offer", RiskBand: "LOW", Rules: []Rule{}, Alternatives: []Alternative{}}
	r.Schedule, _ = Annuity(s.Params.Amount, s.Product.APRBP, s.Params.Term)
	cash := Aggregate(s.Company)
	r.AvailableCash = cash.FreeCashflow
	r.ExistingDebt = cash.ExistingDebt
	if r.Schedule.MonthlyPayment > 0 {
		v := float64(cash.FreeCashflow) / float64(r.Schedule.MonthlyPayment)
		r.Coverage = &v
	}
	add := func(id, msg, input, threshold string) { r.Rules = append(r.Rules, Rule{id, msg, input, threshold}) }
	if s.Company.LegalStatus != "active" || !s.Company.Authorized || s.Company.OverdueDays > s.Policy.MaxOverdue || s.Params.Purpose != s.Product.Purpose {
		r.Outcome = "decline"
		r.RiskBand = "HIGH"
		add("HARD_STOP", "Юридический статус, полномочия или тяжёлая просрочка не позволяют предложить кредит.", s.Company.LegalStatus, "active; authorized; overdue <= policy limit")
		return r
	}
	if s.Company.HistoryMonths < s.Policy.MinHistory {
		r.Outcome = "needs_info"
		r.RiskBand = "MEDIUM"
		add("HISTORY_SHORT", "Недостаточно финансовой истории: приложите сведения за три полных месяца.", fmt.Sprint(s.Company.HistoryMonths), fmt.Sprint(s.Policy.MinHistory))
		return r
	}
	diff := s.Params.DeclaredRevenue - cash.AverageInflow
	if diff < 0 {
		diff = -diff
	}
	if cash.AverageInflow <= 0 || diff*10000 > cash.AverageInflow*s.Policy.RevenueTolerance {
		r.Outcome = "needs_info"
		r.RiskBand = "MEDIUM"
		add("REVENUE_MISMATCH", "Заявленный оборот не согласуется с выпиской. Уточните сведения.", fmt.Sprint(s.Params.DeclaredRevenue), fmt.Sprint(cash.AverageInflow))
		return r
	}
	if s.Product.RequiredDocument != "" {
		found := false
		for _, d := range s.Documents {
			if d.Kind == s.Product.RequiredDocument {
				found = true
			}
		}
		if !found {
			r.Outcome = "needs_info"
			add("DOCUMENT_MISSING", "Нужен счёт или договор на оборудование.", "missing", s.Product.RequiredDocument)
			return r
		}
	}
	if s.Company.BKI == "unavailable" && s.ManualAction == "" {
		r.Outcome = "manual_review"
		r.RiskBand = "MEDIUM"
		add("BKI_UNAVAILABLE", "Учебная БКИ недоступна. Нужна проверка специалиста, это не отказ.", "unavailable", "available")
		return r
	}
	if cash.FreeCashflow <= 0 || r.Schedule.MonthlyPayment <= 0 || cash.FreeCashflow*10000 < r.Schedule.MonthlyPayment*s.Policy.MinCoverage {
		r.Outcome = "manual_review"
		r.RiskBand = "HIGH"
		add("CAPACITY_LOW", "Платёж слишком велик относительно свободного денежного потока.", fmt.Sprint(cash.FreeCashflow), fmt.Sprintf("payment × %0.2f", float64(s.Policy.MinCoverage)/10000))
		if alternatives {
			r.Alternatives = Solve(s)
			if len(r.Alternatives) > 0 {
				r.Outcome = "counteroffer"
			}
		}
		return r
	}
	if cash.FreeCashflow*10000 < r.Schedule.MonthlyPayment*s.Policy.MediumCoverage || s.Company.OverdueDays > 0 {
		r.RiskBand = "MEDIUM"
	}
	add("CAPACITY_OK", "Денежного потока достаточно для платежа с учётом действующего долга.", fmt.Sprint(cash.FreeCashflow), fmt.Sprint(s.Policy.MinCoverage))
	if s.ManualAction == "decline" {
		r.Outcome = "decline"
		add("MANUAL_DECLINE", "Специалист принял мотивированное решение.", s.ManualReason, "")
	}
	if s.ManualAction == "offer" {
		add("MANUAL_REVIEW_COMPLETED", "Специалист завершил проверку и указал основание.", s.ManualReason, "")
	}
	return r
}
func Solve(s Snapshot) []Alternative {
	result := []Alternative{}
	// Prefer closest requested amount, then longer term. Every candidate uses the same evaluator.
	for amount := s.Params.Amount; amount >= s.Product.MinAmount; amount -= 10000000 {
		for term := s.Params.Term; term <= s.Product.MaxTerm; term += 6 {
			v := s
			v.Params.Amount = amount
			v.Params.Term = term
			e := Evaluate(v, false)
			if e.Outcome == "offer" {
				result = append(result, Alternative{v.Params, e.Schedule, e.Coverage, "Допустимо по той же политике; меньшая нагрузка может увеличить общую переплату."})
				break
			}
		}
		if len(result) == 3 {
			break
		}
	}
	return result
}
func RunDecision(a *Application, c Company, product Product, actor, manual, reason string) Decision {
	s := Snapshot{c, a.Params, product, append([]Document{}, a.Documents...), MockChecks(c), DefaultPolicy(), manual, reason}
	d := Decision{ID(), len(a.Revisions), s, Hash(s), s.Policy.Version, product.Version, EngineVersion, Evaluate(s, true), actor, time.Now().UTC()}
	a.Decisions = append(a.Decisions, d)
	return d
}
func CreateOffer(a *Application, d Decision, params Params, kind string) {
	s, _ := Annuity(params.Amount, d.Input.Product.APRBP, params.Term)
	o := Offer{ID(), len(a.Offers) + 1, kind, params, s, d.ID, time.Now().UTC().Add(7 * 24 * time.Hour), time.Now().UTC()}
	a.Offers = append(a.Offers, o)
	a.ActiveOfferID = o.ID
}
func ApplyDecision(a *Application, d Decision, actor string) error {
	switch d.Result.Outcome {
	case "offer":
		CreateOffer(a, d, a.Params, "standard")
		return Transition(a, "offer_issued", actor, "Сформировано демонстрационное предложение")
	case "counteroffer":
		CreateOffer(a, d, d.Result.Alternatives[0].Params, "counteroffer")
		return Transition(a, "offer_issued", actor, "Предложены допустимые альтернативные условия")
	case "needs_info":
		a.InfoRequests = append(a.InfoRequests, InfoRequest{ID(), d.Result.Rules[0].Message, true, ""})
		return Transition(a, "needs_info", actor, d.Result.Rules[0].Message)
	case "decline":
		return Transition(a, "declined", actor, d.Result.Rules[0].Message)
	default:
		return Transition(a, "manual_review", actor, "Требуется решение специалиста")
	}
}
