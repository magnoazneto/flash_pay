package payment

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestParseCSVValidMultipleRows(t *testing.T) {
	csvData := strings.NewReader(`id,amount,recipient,description,payment_method,last_4_digits
pay-1,10.50,Alice,Monthly subscription,credit_card,1234
pay-2,25.00,Bob,Invoice,pix,9999
`)

	rows, errs := ParseCSV(csvData)
	if errs != nil {
		t.Fatalf("expected no errors, got %v", errs)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0].ID != "pay-1" {
		t.Fatalf("expected first row ID pay-1, got %q", rows[0].ID)
	}
	if !rows[0].Amount.Equal(decimal.RequireFromString("10.50")) {
		t.Fatalf("expected first row amount 10.50, got %s", rows[0].Amount.String())
	}
	if rows[1].PaymentMethod != "pix" {
		t.Fatalf("expected second row payment method pix, got %q", rows[1].PaymentMethod)
	}
}

func TestParseCSVAmountZero(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
pay-1,0,Alice,credit_card,1234
`))

	assertSingleParseError(t, errs, 2, "amount")
}

func TestParseCSVAmountNegative(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
pay-1,-10,Alice,credit_card,1234
`))

	assertSingleParseError(t, errs, 2, "amount")
}

func TestParseCSVAmountInvalidText(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
pay-1,abc,Alice,credit_card,1234
`))

	assertSingleParseError(t, errs, 2, "amount")
}

func TestParseCSVLastFourDigitsWithThreeDigits(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
pay-1,10,Alice,credit_card,123
`))

	assertSingleParseError(t, errs, 2, "last_4_digits")
}

func TestParseCSVLastFourDigitsWithLetters(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
pay-1,10,Alice,credit_card,12ab
`))

	assertSingleParseError(t, errs, 2, "last_4_digits")
}

func TestParseCSVRequiredFieldEmpty(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
,10,Alice,credit_card,1234
`))

	assertSingleParseError(t, errs, 2, "id")
}

func TestParseCSVMissingRequiredHeaderReturnsImmediateError(t *testing.T) {
	rows, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method
pay-1,10,Alice,credit_card
`))

	if len(rows) != 0 {
		t.Fatalf("expected no rows on missing header, got %d", len(rows))
	}
	assertSingleParseError(t, errs, 1, "last_4_digits")
}

func TestParseCSVHeaderOnly(t *testing.T) {
	rows, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
`))

	if errs != nil {
		t.Fatalf("expected nil errors, got %v", errs)
	}
	if len(rows) != 0 {
		t.Fatalf("expected empty rows, got %d", len(rows))
	}
}

func TestParseCSVCollectsAllErrorsAcrossMultipleLines(t *testing.T) {
	_, errs := ParseCSV(strings.NewReader(`id,amount,recipient,payment_method,last_4_digits
pay-1,0,Alice,credit_card,1234
pay-2,abc,Bob,credit_card,12ab
pay-3,15,,,
`))

	if len(errs) != 6 {
		t.Fatalf("expected 6 errors, got %d: %v", len(errs), errs)
	}

	assertContainsError(t, errs, 2, "amount")
	assertContainsError(t, errs, 3, "amount")
	assertContainsError(t, errs, 3, "last_4_digits")
	assertContainsError(t, errs, 4, "recipient")
	assertContainsError(t, errs, 4, "payment_method")
	assertContainsError(t, errs, 4, "last_4_digits")
}

func TestParseCSVAllowsEmptyDescription(t *testing.T) {
	rows, errs := ParseCSV(strings.NewReader(`id,amount,recipient,description,payment_method,last_4_digits
pay-1,10,Alice,,credit_card,1234
`))

	if errs != nil {
		t.Fatalf("expected no errors, got %v", errs)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].Description != "" {
		t.Fatalf("expected empty description, got %q", rows[0].Description)
	}
}

func assertSingleParseError(t *testing.T, errs []ParseError, expectedLine int, expectedColumn string) {
	t.Helper()

	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d: %v", len(errs), errs)
	}
	if errs[0].Line != expectedLine {
		t.Fatalf("expected line %d, got %d", expectedLine, errs[0].Line)
	}
	if errs[0].Column != expectedColumn {
		t.Fatalf("expected column %q, got %q", expectedColumn, errs[0].Column)
	}
}

func assertContainsError(t *testing.T, errs []ParseError, expectedLine int, expectedColumn string) {
	t.Helper()

	for _, err := range errs {
		if err.Line == expectedLine && err.Column == expectedColumn {
			return
		}
	}

	t.Fatalf("expected error for line %d column %q in %v", expectedLine, expectedColumn, errs)
}
