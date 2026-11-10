package data

import (
	"strings"
	"testing"
)

func TestStatsBucketExprMySQL57(t *testing.T) {
	for _, hourly := range []bool{false, true} {
		expr, err := statsBucketExprForDialect("mysql", "created_at", hourly)
		if err != nil { t.Fatal(err) }
		if !strings.Contains(expr, "DATE_FORMAT(created_at,") {
			t.Fatalf("mysql bucket does not use MySQL 5.7 DATE_FORMAT")
		}
		if hourly && !strings.Contains(expr, "%H:00") {
			t.Fatalf("hourly bucket must preserve hourly grouping: %s", expr)
		}
		if !hourly && strings.Contains(expr, "%H") {
			t.Fatalf("daily bucket unexpectedly includes hour: %s", expr)
		}
	}
	if _, err := statsBucketExprForDialect("unknown", "created_at", false); err == nil {
		t.Fatal("unsupported SQL dialect must fail")
	}
}
