package domain

import (
	"fmt"
	"math/big"
	"sort"
	"time"
)

type Payment struct {
	Month     int   `json:"month"`
	Payment   int64 `json:"payment_kopeks"`
	Principal int64 `json:"principal_kopeks"`
	Interest  int64 `json:"interest_kopeks"`
	Balance   int64 `json:"balance_kopeks"`
}
type Schedule struct {
	MonthlyPayment int64     `json:"monthly_payment_kopeks"`
	TotalPayment   int64     `json:"total_payment_kopeks"`
	TotalInterest  int64     `json:"total_interest_kopeks"`
	APRBP          int64     `json:"apr_basis_points"`
	Payments       []Payment `json:"payments"`
}

func roundRat(x *big.Rat) int64 {
	q, r := new(big.Int), new(big.Int)
	q.QuoRem(x.Num(), x.Denom(), r)
	if new(big.Int).Mul(r, big.NewInt(2)).Cmp(x.Denom()) >= 0 {
		q.Add(q, big.NewInt(1))
	}
	return q.Int64()
}

// Exact rational arithmetic. Positive monetary values rounded half-up to a kopek.
func Annuity(principal, aprBP int64, months int) (Schedule, error) {
	s := Schedule{APRBP: aprBP, Payments: []Payment{}}
	if principal <= 0 || principal > 1000000000000 || aprBP < 0 || aprBP > 100000 || months < 1 || months > 600 {
		return s, fmt.Errorf("некорректные параметры графика")
	}
	r := big.NewRat(aprBP, 120000)
	pmt := big.NewRat(principal, int64(months))
	if aprBP > 0 {
		base := new(big.Rat).Add(big.NewRat(1, 1), r)
		pow := big.NewRat(1, 1)
		for i := 0; i < months; i++ {
			pow.Mul(pow, base)
		}
		num := new(big.Rat).Mul(big.NewRat(principal, 1), r)
		num.Mul(num, pow)
		pmt.Quo(num, new(big.Rat).Sub(pow, big.NewRat(1, 1)))
	}
	s.MonthlyPayment = roundRat(pmt)
	balance := principal
	for i := 1; i <= months; i++ {
		interest := roundRat(new(big.Rat).Mul(big.NewRat(balance, 1), r))
		pay := s.MonthlyPayment
		if i == months || pay > balance+interest {
			pay = balance + interest
		}
		paid := pay - interest
		balance -= paid
		s.Payments = append(s.Payments, Payment{i, pay, paid, interest, balance})
		s.TotalPayment += pay
		s.TotalInterest += interest
	}
	return s, nil
}

type Cashflow struct {
	Transactions     []Transaction `json:"transactions"`
	Monthly          []Monthly     `json:"monthly"`
	OpeningBalance   int64         `json:"opening_balance_kopeks"`
	AverageInflow    int64         `json:"average_inflow_kopeks"`
	AverageOperating int64         `json:"average_operating_kopeks"`
	ExistingDebt     int64         `json:"existing_debt_kopeks"`
	FreeCashflow     int64         `json:"free_cashflow_kopeks"`
	HistoryMonths    int           `json:"history_months"`
	Source           string        `json:"source"`
}
type Monthly struct {
	Month     string `json:"month"`
	Inflow    int64  `json:"inflow_kopeks"`
	Operating int64  `json:"operating_kopeks"`
	Debt      int64  `json:"debt_kopeks"`
	Net       int64  `json:"net_kopeks"`
}

func Aggregate(c Company) Cashflow {
	f := Cashflow{Transactions: c.Transactions, Monthly: []Monthly{}, OpeningBalance: c.OpeningBalance, HistoryMonths: c.HistoryMonths, Source: "simulated; seed=2026"}
	byMonth := map[string]*Monthly{}
	for _, t := range c.Transactions {
		if t.Category == "internal_transfer" {
			continue
		}
		k := t.Date[:7]
		if byMonth[k] == nil {
			byMonth[k] = &Monthly{Month: k}
		}
		m := byMonth[k]
		if t.Category == "refund" {
			if t.Direction == "debit" {
				m.Inflow -= t.Amount
			} else {
				m.Operating -= t.Amount
			}
			continue
		}
		if t.Direction == "credit" && t.Category != "one_off" {
			m.Inflow += t.Amount
		}
		if t.Direction == "debit" {
			if t.Category == "debt" {
				m.Debt += t.Amount
			} else {
				m.Operating += t.Amount
			}
		}
	}
	keys := []string{}
	for k := range byMonth {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		m := *byMonth[k]
		m.Net = m.Inflow - m.Operating - m.Debt
		f.Monthly = append(f.Monthly, m)
		f.AverageInflow += m.Inflow
		f.AverageOperating += m.Operating
		f.ExistingDebt += m.Debt
	}
	if len(keys) > 0 {
		f.AverageInflow /= int64(len(keys))
		f.AverageOperating /= int64(len(keys))
		f.ExistingDebt /= int64(len(keys))
	}
	f.FreeCashflow = f.AverageInflow - f.AverageOperating - f.ExistingDebt
	return f
}

type ForecastPoint struct {
	Date     string `json:"date"`
	Baseline int64  `json:"baseline_kopeks"`
	Funded   int64  `json:"funded_kopeks"`
	Lower    int64  `json:"lower_kopeks"`
	Upper    int64  `json:"upper_kopeks"`
}
type Forecast struct {
	Points        []ForecastPoint `json:"points"`
	CashGapDate   *string         `json:"cash_gap_date"`
	FundedGapDate *string         `json:"funded_gap_date"`
	MinBalance    int64           `json:"forecast_min_balance_kopeks"`
	FundedMin     int64           `json:"funded_min_balance_kopeks"`
	Sufficient    bool            `json:"sufficient_history"`
	Assumptions   []string        `json:"assumptions"`
}

func ForecastCash(c Company, horizon int, principal int64, schedule Schedule) Forecast {
	f := Forecast{Points: []ForecastPoint{}, Sufficient: c.HistoryMonths >= 3, Assumptions: []string{
		"Синтетические данные. Детерминированный прогноз, не ML и не гарантия.",
		"Медиана дневных продаж и расходов по дню месяца; внутренние переводы исключены.",
		"Выдача на следующий день — финансирование, не выручка. Платежи ежемесячно, включая проценты.",
		"Диапазон ±15% накопленной выручки — эвристика, не доверительный интервал.",
	}}
	if !f.Sufficient {
		f.Assumptions = append(f.Assumptions, "Недостаточно данных: нужно не менее трёх полных месяцев.")
		return f
	}
	if horizon < 1 || horizon > 90 {
		horizon = 90
	}
	daily := map[int][]int64{}
	expensesByDate := map[string]int64{}
	creditsByDate := map[string]int64{}
	inflows := []int64{}
	for _, t := range c.Transactions {
		if t.Category == "internal_transfer" || t.Category == "one_off" || t.Category == "refund" {
			continue
		}
		if t.Direction == "credit" {
			creditsByDate[t.Date] += t.Amount
		} else {
			expensesByDate[t.Date] += t.Amount
		}
	}
	median := func(vals []int64) int64 {
		if len(vals) == 0 {
			return 0
		}
		v := append([]int64{}, vals...)
		sort.Slice(v, func(i, j int) bool { return v[i] < v[j] })
		return v[len(v)/2]
	}
	for ds, amount := range expensesByDate {
		d, _ := time.Parse("2006-01-02", ds)
		daily[d.Day()] = append(daily[d.Day()], amount)
	}
	for _, amount := range creditsByDate {
		inflows = append(inflows, amount)
	}
	revenue := median(inflows)
	baseline, funded := c.OpeningBalance, c.OpeningBalance
	f.MinBalance, f.FundedMin = baseline, funded
	start := time.Date(2026, 10, 22, 0, 0, 0, 0, time.UTC)
	var cumulativeInflow int64
	for day := 0; day <= horizon; day++ {
		date := start.AddDate(0, 0, day)
		ds := date.Format("2006-01-02")
		if day > 0 {
			out := median(daily[date.Day()])
			// Seed has one categorized operating/debt expense per calendar day.
			for _, cm := range c.Commitments {
				if cm.Date == ds {
					out += cm.Amount
				}
			}
			baseline += revenue - out
			funded += revenue - out
			cumulativeInflow += revenue
			if day == 1 {
				funded += principal
			}
			for i, p := range schedule.Payments {
				if date.Equal(start.AddDate(0, i+1, 1)) {
					funded -= p.Payment
				}
			}
		}
		if baseline < f.MinBalance {
			f.MinBalance = baseline
		}
		if funded < f.FundedMin {
			f.FundedMin = funded
		}
		if baseline < 0 && f.CashGapDate == nil {
			v := ds
			f.CashGapDate = &v
		}
		if funded < 0 && f.FundedGapDate == nil {
			v := ds
			f.FundedGapDate = &v
		}
		f.Points = append(f.Points, ForecastPoint{ds, baseline, funded, baseline - cumulativeInflow*15/100, baseline + cumulativeInflow*15/100})
	}
	return f
}
