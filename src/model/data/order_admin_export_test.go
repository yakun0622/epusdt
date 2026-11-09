package data

import (
	"fmt"
	"testing"

	"github.com/GMWalletApp/epusdt/internal/testutil"
	"github.com/GMWalletApp/epusdt/model/dao"
	"github.com/GMWalletApp/epusdt/model/mdb"
)

// A regression for the original CSV endpoint inadvertently using ListOrders'
// maximum page size (200) even though its documented export cap is 10,000.
func TestListOrdersForExportDoesNotStopAtUIPageLimit(t *testing.T) {
	cleanup := testutil.SetupTestDatabases(t)
	defer cleanup()

	orders := make([]mdb.Orders, 205)
	for i := range orders {
		orders[i] = mdb.Orders{
			TradeId: fmt.Sprintf("export-trade-%03d", i),
			OrderId: fmt.Sprintf("export-merchant-%03d", i),
			Status:  mdb.StatusWaitPay,
			Network: mdb.NetworkTron,
			Token:   "USDT",
		}
	}
	if err := dao.Mdb.CreateInBatches(&orders, 50).Error; err != nil {
		t.Fatalf("seed orders: %v", err)
	}

	filter := OrderListFilter{Page: 1, PageSize: 10000, Network: mdb.NetworkTron, Token: "USDT"}
	page, total, err := ListOrders(filter)
	if err != nil {
		t.Fatalf("list orders: %v", err)
	}
	if total != 205 || len(page) != 200 {
		t.Fatalf("page = %d / total = %d; want 200 / 205", len(page), total)
	}

	exported, err := ListOrdersForExport(filter)
	if err != nil {
		t.Fatalf("export orders: %v", err)
	}
	if len(exported) != 205 {
		t.Fatalf("export = %d rows, want 205", len(exported))
	}
	if exported[0].TradeId != "export-trade-204" {
		t.Fatalf("export order = %s; expected newest first", exported[0].TradeId)
	}
	excluded, err := ListOrdersForExport(OrderListFilter{Status: mdb.StatusPaySuccess})
	if err != nil {
		t.Fatalf("filter exported orders: %v", err)
	}
	if len(excluded) != 0 {
		t.Fatalf("filtered export = %d, want 0", len(excluded))
	}
}
