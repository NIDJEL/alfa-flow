package domain

import (
	"encoding/json"
	"testing"
)

func TestAnnuity(t *testing.T) {
	for _, tc := range []struct {
		p, r int64
		n    int
	}{{100000000, 2200, 24}, {10001, 0, 6}, {1000000000, 1900, 48}, {100, 0, 3}, {1000000000000, 100000, 600}} {
		s, e := Annuity(tc.p, tc.r, tc.n)
		if e != nil {
			t.Fatal(e)
		}
		var paid, interest int64
		for _, p := range s.Payments {
			paid += p.Principal
			interest += p.Interest
			if p.Balance < 0 {
				t.Fatal("negative balance")
			}
		}
		if paid != tc.p || interest != s.TotalInterest || s.TotalPayment != paid+interest || s.Payments[len(s.Payments)-1].Balance != 0 {
			t.Fatalf("schedule does not reconcile: %+v", tc)
		}
	}
	for _, p := range []int64{0, -1, 1000000000001} {
		if _, e := Annuity(p, 2200, 24); e == nil {
			t.Fatal("invalid principal accepted")
		}
	}
}
func TestStateGraph(t *testing.T) {
	for _, p := range [][2]string{{"draft", "issued"}, {"declined", "issued"}, {"needs_info", "issued"}, {"issued", "issued"}, {"offer_issued", "draft"}} {
		if CanTransition(p[0], p[1]) {
			t.Fatal("invalid transition", p)
		}
	}
	a := Application{Status: "draft"}
	for _, s := range []string{"submitted", "validating", "scoring", "offer_issued", "offer_accepted", "signing_simulated", "issued"} {
		if e := Transition(&a, s, "test", "test"); e != nil {
			t.Fatal(e)
		}
	}
	if len(a.Events) != 7 {
		t.Fatal("events missing")
	}
}
func fixture(i int) Snapshot {
	c := SeedCompanies()[i]
	p := Params{"WORKING_CAPITAL_LOAN", "working_capital", 100000000, 24, c.DeclaredRevenue}
	if i == 1 {
		p.Amount = 500000000
		p.Term = 12
	}
	return Snapshot{Company: c, Params: p, Product: Products()[0], Policy: DefaultPolicy(), Documents: []Document{}, Checks: MockChecks(c)}
}
func TestFixtures(t *testing.T) {
	wants := []string{"offer", "counteroffer", "needs_info", "decline", "manual_review", "needs_info"}
	for i, want := range wants {
		s := fixture(i)
		r := Evaluate(s, true)
		if r.Outcome != want {
			t.Errorf("%s: got %s want %s", s.Company.Persona, r.Outcome, want)
		}
		for _, alt := range r.Alternatives {
			s.Params = alt.Params
			if Evaluate(s, false).Outcome != "offer" {
				t.Fatal("invalid alternative")
			}
		}
	}
}
func TestNeedsInfoCorrected(t *testing.T) {
	s := fixture(2)
	s.Params.DeclaredRevenue = Aggregate(s.Company).AverageInflow
	if Evaluate(s, true).Outcome != "offer" {
		t.Fatal("correction must clear conflict")
	}
}
func TestHardStopNoBypass(t *testing.T) {
	s := fixture(3)
	s.Params.Amount = s.Product.MinAmount
	s.Params.Term = s.Product.MaxTerm
	r := Evaluate(s, true)
	if r.Outcome != "decline" || len(r.Alternatives) != 0 {
		t.Fatal("hard stop bypass")
	}
}
func TestProductBoundaries(t *testing.T) {
	s := fixture(0)
	for _, p := range []Params{{"WORKING_CAPITAL_LOAN", "working_capital", 0, 24, 0}, {"WORKING_CAPITAL_LOAN", "working_capital", -1, 24, 0}, {"WORKING_CAPITAL_LOAN", "working_capital", 500000001, 24, 0}, {"WORKING_CAPITAL_LOAN", "working_capital", 100000000, 1, 0}, {"WORKING_CAPITAL_LOAN", "working_capital", 100000000, 48, 0}, {"WORKING_CAPITAL_LOAN", "equipment", 100000000, 24, 0}} {
		if _, e := Validate(p, Products()); e == nil {
			t.Fatal("invalid params accepted", p)
		}
	}
	s.Params.Amount = s.Product.MinAmount
	s.Params.Term = s.Product.MinTerm
	if _, e := Validate(s.Params, Products()); e != nil {
		t.Fatal(e)
	}
}
func TestReplayHistoricalPolicy(t *testing.T) {
	s := fixture(0)
	b, _ := json.Marshal(s)
	var immutable Snapshot
	_ = json.Unmarshal(b, &immutable)
	want := Hash(Evaluate(immutable, true))
	hash := Hash(immutable)
	newPolicy := DefaultPolicy()
	newPolicy.MinCoverage = 9999999
	s.Policy = newPolicy
	if Hash(Evaluate(s, true)) == want {
		t.Fatal("policy should alter current result")
	}
	if Hash(Evaluate(immutable, true)) != want || Hash(immutable) != hash {
		t.Fatal("historical replay changed")
	}
}
func TestCashflowAndForecast(t *testing.T) {
	c := SeedCompanies()[0]
	f := Aggregate(c)
	if f.AverageInflow != 300000000 || f.FreeCashflow != 35000000 {
		t.Fatalf("aggregation mismatch %+v", f)
	}
	s, _ := Annuity(100000000, 2200, 24)
	baseline := ForecastCash(c, 90, 0, Schedule{})
	funded := ForecastCash(c, 90, 100000000, s)
	if baseline.CashGapDate == nil {
		t.Fatal("expected cash gap")
	}
	if funded.FundedGapDate!=nil || funded.FundedMin<0 {t.Fatal("A funding should close the seeded cash gap including debt payments")}
	var payments int64
	for _, p := range s.Payments[:2] {
		payments += p.Payment
	}
	last := len(funded.Points) - 1
	if funded.Points[last].Funded-baseline.Points[last].Baseline != 100000000-payments {
		t.Fatal("funding/payment reconciliation")
	}
	if ForecastCash(SeedCompanies()[5], 90, 0, Schedule{}).Sufficient {
		t.Fatal("short history")
	}
}
func TestRefundsAndOneOffsNotDoubleCounted(t *testing.T) {
	c := Company{HistoryMonths: 3, Transactions: []Transaction{
		{Date: "2026-09-01", Amount: 10000, Direction: "credit", Category: "sales"},
		{Date: "2026-09-01", Amount: 4000, Direction: "debit", Category: "operations"},
		{Date: "2026-09-02", Amount: 1000, Direction: "debit", Category: "refund"},
		{Date: "2026-09-02", Amount: 500, Direction: "credit", Category: "refund"},
		{Date: "2026-09-03", Amount: 9999999, Direction: "credit", Category: "internal_transfer"},
		{Date: "2026-09-03", Amount: 9999999, Direction: "credit", Category: "one_off"},
	}}
	f := Aggregate(c)
	if f.AverageInflow != 9000 || f.AverageOperating != 3500 || f.FreeCashflow != 5500 {
		t.Fatal("refund double-count", f)
	}
}
