package domain

import (
	"crypto/sha256"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// UTF-8 CSV, decimal rubles; floats are never used for persisted amounts.
func ParseCashflowCSV(companyID, content string) ([]Transaction, error) {
	if len(content) > 1024*1024 {
		return nil, fmt.Errorf("CSV превышает 1 МБ")
	}
	if !utf8.ValidString(content) {
		return nil, fmt.Errorf("CSV должен быть в UTF-8")
	}
	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(content, "\ufeff")))
	reader.FieldsPerRecord = 6
	header, e := reader.Read()
	if e != nil {
		return nil, fmt.Errorf("не удалось прочитать заголовок")
	}
	if strings.Join(header, ",") != "date,amount,currency,direction,category,description" {
		return nil, fmt.Errorf("ожидается заголовок date,amount,currency,direction,category,description")
	}
	out := []Transaction{}
	seen := map[string]bool{}
	allowed := map[string]bool{"sales": true, "operations": true, "rent": true, "payroll": true, "debt": true, "internal_transfer": true, "one_off": true, "refund": true}
	for row := 2; ; row++ {
		cols, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("строка %d: некорректный CSV", row)
		}
		if row > 1001 {
			return nil, fmt.Errorf("не более 1000 строк")
		}
		d, err := time.Parse("2006-01-02", cols[0])
		if err != nil || !d.Before(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)) || d.Year() < 2020 {
			return nil, fmt.Errorf("строка %d: дата должна быть до 01.10.2026 (полный месяц истории)", row)
		}
		pieces := strings.Split(cols[1], ".")
		if len(pieces) > 2 || len(pieces[0]) == 0 || strings.ContainsAny(cols[1], "+-eE, ") {
			return nil, fmt.Errorf("строка %d: сумма — положительные рубли с точкой и ≤2 знаками", row)
		}
		rubles, err := strconv.ParseInt(pieces[0], 10, 64)
		if err != nil || rubles < 0 || rubles > 1000000000 {
			return nil, fmt.Errorf("строка %d: сумма вне допустимого диапазона", row)
		}
		var kopeks int64
		if len(pieces) == 2 {
			if len(pieces[1]) < 1 || len(pieces[1]) > 2 {
				return nil, fmt.Errorf("строка %d: не более двух знаков после точки", row)
			}
			fraction := pieces[1]
			if len(fraction) == 1 {
				fraction += "0"
			}
			kopeks, err = strconv.ParseInt(fraction, 10, 64)
			if err != nil || kopeks < 0 || kopeks > 99 {
				return nil, fmt.Errorf("строка %d: неверные копейки", row)
			}
		}
		amount := rubles*100 + kopeks
		if amount <= 0 || amount > 100000000000 {
			return nil, fmt.Errorf("строка %d: сумма должна быть >0 и ≤1 млрд ₽", row)
		}
		if cols[2] != "RUB" || (cols[3] != "credit" && cols[3] != "debit") || !allowed[cols[4]] {
			return nil, fmt.Errorf("строка %d: проверьте RUB, credit/debit и category", row)
		}
		if len(cols[5]) > 300 {
			return nil, fmt.Errorf("строка %d: описание не более 300 символов", row)
		}
		h := sha256.Sum256([]byte(companyID + "|" + strings.Join(cols, "|")))
		h[6] = (h[6] & 15) | 0x50
		h[8] = (h[8] & 63) | 0x80
		id := fmt.Sprintf("%x-%x-%x-%x-%x", h[:4], h[4:6], h[6:8], h[8:10], h[10:16])
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, Transaction{id, cols[0], amount, cols[3], cols[4], cols[5], cols[4] == "rent" || cols[4] == "payroll" || cols[4] == "debt", "RUB"})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("CSV не содержит операций")
	}
	return out, nil
}
