package payment

import (
	"encoding/csv"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/shopspring/decimal"
)

var lastFourDigitsRe = regexp.MustCompile("^[0-9]{4}$")

type PaymentRow struct {
	ID             string
	Amount         decimal.Decimal
	Recipient      string
	Description    string
	PaymentMethod  string
	LastFourDigits string
}

type ParseError struct {
	Line    int
	Column  string
	Message string
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("linha %d, coluna '%s': %s", e.Line, e.Column, e.Message)
}

func ParseCSV(r io.Reader) ([]PaymentRow, []ParseError) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err == io.EOF {
		return nil, []ParseError{{
			Line:    1,
			Column:  "header",
			Message: "cabecalho ausente",
		}}
	}
	if err != nil {
		return nil, []ParseError{{
			Line:    1,
			Column:  "header",
			Message: err.Error(),
		}}
	}

	headerIndex := make(map[string]int, len(header))
	for i, column := range header {
		headerIndex[strings.TrimSpace(column)] = i
	}

	requiredColumns := []string{"id", "amount", "recipient", "payment_method", "last_4_digits"}
	var headerErrors []ParseError
	for _, column := range requiredColumns {
		if _, ok := headerIndex[column]; !ok {
			headerErrors = append(headerErrors, ParseError{
				Line:    1,
				Column:  column,
				Message: "coluna obrigatoria ausente",
			})
		}
	}
	if len(headerErrors) > 0 {
		return nil, headerErrors
	}

	var rows []PaymentRow
	var parseErrors []ParseError
	line := 1

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}

		line++

		if err != nil {
			parseErrors = append(parseErrors, ParseError{
				Line:    line,
				Column:  "row",
				Message: err.Error(),
			})
			continue
		}

		getValue := func(column string) string {
			idx, ok := headerIndex[column]
			if !ok || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}

		row := PaymentRow{
			ID:             getValue("id"),
			Recipient:      getValue("recipient"),
			Description:    getValue("description"),
			PaymentMethod:  getValue("payment_method"),
			LastFourDigits: getValue("last_4_digits"),
		}

		rowHasError := false

		requiredFields := map[string]string{
			"id":             row.ID,
			"amount":         getValue("amount"),
			"recipient":      row.Recipient,
			"payment_method": row.PaymentMethod,
			"last_4_digits":  row.LastFourDigits,
		}

		for column, value := range requiredFields {
			if value == "" {
				parseErrors = append(parseErrors, ParseError{
					Line:    line,
					Column:  column,
					Message: "campo obrigatorio vazio",
				})
				rowHasError = true
			}
		}

		amountValue := requiredFields["amount"]
		if amountValue != "" {
			amount, amountErr := decimal.NewFromString(amountValue)
			if amountErr != nil {
				parseErrors = append(parseErrors, ParseError{
					Line:    line,
					Column:  "amount",
					Message: "valor invalido",
				})
				rowHasError = true
			} else if !amount.GreaterThan(decimal.Zero) {
				parseErrors = append(parseErrors, ParseError{
					Line:    line,
					Column:  "amount",
					Message: "deve ser maior que zero",
				})
				rowHasError = true
			} else {
				row.Amount = amount
			}
		}

		if row.LastFourDigits != "" && !lastFourDigitsRe.MatchString(row.LastFourDigits) {
			parseErrors = append(parseErrors, ParseError{
				Line:    line,
				Column:  "last_4_digits",
				Message: "deve conter exatamente 4 digitos numericos",
			})
			rowHasError = true
		}

		if rowHasError {
			continue
		}

		rows = append(rows, row)
	}

	if len(rows) == 0 && len(parseErrors) == 0 {
		return []PaymentRow{}, nil
	}

	return rows, parseErrors
}
