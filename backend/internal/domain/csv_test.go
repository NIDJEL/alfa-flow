package domain

import "testing"

func TestCSVImport(t *testing.T) {
	header := "date,amount,currency,direction,category,description\n"
	body := header + "2026-09-10,123.45,RUB,credit,sales,Синтетическая выручка\n"
	a, e := ParseCashflowCSV("company", body)
	if e != nil || len(a) != 1 || a[0].Amount != 12345 {
		t.Fatal(a, e)
	}
	b, e := ParseCashflowCSV("company", body)
	if e != nil || a[0].ID != b[0].ID {
		t.Fatal("idempotency")
	}
	for _, row := range []string{"2026-09-10,NaN,RUB,credit,sales,x", "2026-09-10,1.001,RUB,credit,sales,x", "2026-09-10,-1,RUB,credit,sales,x", "2026-11-10,1,RUB,credit,sales,x", "2026-09-10,1,USD,credit,sales,x", "2026-09-10,1,RUB,credit,unknown,x"} {
		if _, e := ParseCashflowCSV("company", header+row); e == nil {
			t.Fatal("invalid row accepted", row)
		}
	}
	if _,e:=ParseCashflowCSV("company",header+string([]byte{0xff}));e==nil{t.Fatal("invalid UTF8")}
}
