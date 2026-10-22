package domain

import (
	"fmt"
	"time"
)

func SeedCompanies() []Company {
	names := []string{"ООО «Северный Кофе»", "ИП «Маркет Восток»", "ООО «Маяк Сервис»", "ООО «Контур Демо»", "ООО «Линия Плюс»", "ИП «Новый Старт»"}
	personas := []string{"A_APPROVED", "B_COUNTEROFFER", "C_NEEDS_INFO", "D_DECLINED", "E_MANUAL_REVIEW", "F_INSUFFICIENT_HISTORY"}
	all := []Company{}
	for i := 0; i < 20; i++ {
		name := fmt.Sprintf("ООО «Демо-профиль %02d»", i+1)
		persona := fmt.Sprintf("DEMO_%02d", i+1)
		if i < 6 {
			name = names[i]
			persona = personas[i]
		}
		c := Company{ID: StableID(i + 1), Name: name, Persona: persona, TaxID: fmt.Sprintf("DEMO-ИНН-%04d", i+1), Contact: "Представитель демо-компании", LegalStatus: "active", BKI: "clear", Authorized: true, OpeningBalance: 32000000, HistoryMonths: 6, Transactions: []Transaction{}, Commitments: []Commitment{{"2026-11-02", 110000000, "Разовая закупка сырья (учебное обязательство)"}}}
		revenue, operating, debt := int64(300000000), int64(255000000), int64(10000000)
		if i == 1 {
			revenue = 200000000
			operating = 184000000
			debt = 4000000
			c.OpeningBalance = 18000000
		}
		if i == 3 {
			c.LegalStatus = "liquidating"
		}
		if i == 4 {
			c.BKI = "unavailable"
		}
		if i == 5 {
			c.HistoryMonths = 1
		}
		for month := 0; month < c.HistoryMonths; month++ {
			start := time.Date(2026, 4+time.Month(month), 1, 0, 0, 0, 0, time.UTC)
			days := start.AddDate(0, 1, -1).Day()
			for day := 1; day <= days; day++ {
				// All seeded months have exactly configured totals, deterministic day variance.
				in := revenue / int64(days)
				op := operating / int64(days)
				if day == days {
					in += revenue % int64(days)
					op += operating % int64(days)
				}
				date := start.AddDate(0, 0, day-1).Format("2006-01-02")
				category := "operations"
				description := "Поставщики и текущие расходы"
				if day == 5 {
					category = "rent"
					description = "Аренда"
				}
				if day == 15 {
					category = "payroll"
					description = "Оплата труда"
				}
				out := op
				if day == 25 {
					out += debt
					category = "operating_and_debt"
					description = "Операционные расходы"
				}
				if day == 25 { // Separate debt for capacity; forecast aggregates same-day expenses below.
					out = op
					c.Transactions = append(c.Transactions, Transaction{StableID(100000 + i*1000 + month*40 + day), date, debt, "debit", "debt", "Действующий долг", true, "RUB"})
				}
				c.Transactions = append(c.Transactions, Transaction{StableID(200000 + i*1000 + month*40 + day), date, in, "credit", "sales", "Синтетическая выручка", false, "RUB"}, Transaction{StableID(300000 + i*1000 + month*40 + day), date, out, "debit", category, description, true, "RUB"})
			}
			c.Transactions = append(c.Transactions, Transaction{StableID(400000 + i*100 + month), start.Format("2006-01-02"), 5000000, "credit", "internal_transfer", "Между собственными счетами — не выручка", false, "RUB"})
		}
		c.DeclaredRevenue = revenue
		if i == 2 {
			c.DeclaredRevenue = 420000000
		}
		all = append(all, c)
	}
	return all
}

func NewDraft(c Company, p Params) Application {
	now := time.Now().UTC()
	a := Application{ID: ID(), CompanyID: c.ID, CompanyName: c.Name, Persona: c.Persona, Status: "draft", Version: 1, Params: p, Documents: []Document{}, Revisions: []Revision{}, Decisions: []Decision{}, Offers: []Offer{}, Events: []Event{}, InfoRequests: []InfoRequest{}, CreatedAt: now, UpdatedAt: now}
	AddEvent(&a, "draft_created", "client", "Черновик сохранён")
	return a
}
