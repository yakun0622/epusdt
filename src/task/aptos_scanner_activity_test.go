package task

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	scanner "github.com/GMWalletApp/ChainScanner"
	"github.com/GMWalletApp/epusdt/internal/testutil"
	"github.com/GMWalletApp/epusdt/model/dao"
	"github.com/GMWalletApp/epusdt/model/data"
	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/model/service"
)

type aptosHeightFeed struct {
	scanner.Feed
	height int64
}

func (f *aptosHeightFeed) Height(context.Context, string) (int64, error) {
	return f.height, nil
}

func TestW61ScannerConfirmationFenceForAptos(t *testing.T) {
	for _, tc := range []struct {
		symbol, metadata string
		enabled          bool
	}{
		{"USDT", "0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b", true},
		{"MOVEUSD", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true},
		{"DISABLED", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", false},
	} {
		t.Run(tc.symbol, func(t *testing.T) {
			defer testutil.SetupTestDatabases(t)()
			ctx := t.Context()
			network := mdb.NetworkAptos
			wallet, err := scanner.Canonical(network, "0xa")
			if err != nil {
				t.Fatal(err)
			}
			chain := &mdb.Chain{Network: network, Enabled: true, MinConfirmations: 2}
			token := &mdb.ChainToken{Network: network, Symbol: tc.symbol, ContractAddress: tc.metadata, Decimals: 6, Enabled: true}
			for _, row := range []any{chain, token} {
				if err := dao.Mdb.Create(row).Error; err != nil {
					t.Fatal(err)
				}
			}
			if !tc.enabled {
				if err := dao.Mdb.Model(chain).Update("enabled", false).Error; err != nil {
					t.Fatal(err)
				}
			}
			order := &mdb.Orders{
				TradeId: "aptos-activity", OrderId: "aptos-invoice", Network: network,
				Token: tc.symbol, ReceiveAddress: wallet, Amount: 3.1, ActualAmount: 3.1,
				Status: mdb.StatusWaitPay, PayProvider: mdb.PaymentProviderOnChain,
			}
			if err := data.CreateOrderWithTransaction(dao.Mdb, order); err != nil {
				t.Fatal(err)
			}
			if err := data.LockTransaction(network, wallet, tc.symbol, order.TradeId, order.ActualAmount, time.Hour); err != nil {
				t.Fatal(err)
			}

			const txID = "0xabc"
			const version int64 = 101
			timestamp := order.CreatedAt.TimestampMilli() + 1000
			raw := aptosActivityFixture(wallet, tc.metadata, txID, version, timestamp)
			event := scanner.Activity{
				Network: network, Addresses: []string{wallet}, TxID: txID,
				TimeMS: timestamp, Height: version, Confirmations: 1, Data: raw,
			}
			for i := 0; i < 2; i++ {
				if err := processScannerActivity(ctx, event); err != nil {
					t.Fatal(err)
				}
			}
			var jobs []mdb.PaymentConfirmation
			if err := dao.Mdb.Find(&jobs).Error; err != nil {
				t.Fatal(err)
			}
			if !tc.enabled {
				current, err := data.GetOrderInfoByTradeId(order.TradeId)
				if len(jobs) != 0 || err != nil || current.Status != mdb.StatusWaitPay {
					t.Fatal("disabled Aptos chain must leave the order waiting")
				}
				return
			}
			if len(jobs) != 1 {
				t.Fatalf("duplicate delivery queued %d confirmation jobs, want 1", len(jobs))
			}
			feed := &aptosHeightFeed{height: version}
			lookups := 0
			lookup := func(_ context.Context, gotNetwork, gotHash string, height int64) (json.RawMessage, error) {
				lookups++
				if gotNetwork != network || gotHash != txID || height != version {
					t.Fatalf("unexpected Aptos recheck %s %s %d", gotNetwork, gotHash, height)
				}
				return raw, nil
			}
			if err := service.ConfirmPayment(ctx, feed, lookup, jobs[0]); err == nil || lookups != 0 {
				t.Fatal("unconfirmed Aptos transfer proceeded to the independent recheck")
			}
			feed.height++
			if err := service.ConfirmPayment(ctx, feed, lookup, jobs[0]); err != nil {
				t.Fatal(err)
			}
			if err := processScannerActivity(ctx, event); err != nil {
				t.Fatal(err)
			}
			paid, err := data.GetOrderInfoByTradeId(order.TradeId)
			if err != nil || paid.Status != mdb.StatusPaySuccess || paid.BlockTransactionId != txID || paid.CallBackConfirm != mdb.CallBackConfirmNo {
				t.Fatalf("Aptos settlement did not produce a paid order and one pending callback: %v", err)
			}
			var claims int64
			if err := dao.Mdb.Model(&mdb.PaymentTxClaim{}).Count(&claims).Error; err != nil || claims != 1 || lookups != 1 {
				t.Fatalf("Aptos settlement claims=%d rechecks=%d: %v", claims, lookups, err)
			}
			owner, err := data.GetTradeIdByWalletAddressAndAmountAndToken(network, wallet, tc.symbol, order.ActualAmount)
			if err != nil || owner != "" {
				t.Fatalf("settled Aptos reservation remained active: %q %v", owner, err)
			}
		})
	}
}

func aptosActivityFixture(wallet, metadata, hash string, version, timeMS int64) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{
		"type":"user_transaction","success":true,"hash":%q,"version":"%d","timestamp":"%d",
		"events":[
			{"type":"0x1::fungible_asset::Withdraw","data":{"amount":"3100000","store":"0x11"}},
			{"type":"0x1::fungible_asset::Deposit","data":{"amount":"3100000","store":"0x12"}}
		],
		"changes":[
			{"type":"write_resource","address":"0x11","data":{"type":"0x1::fungible_asset::FungibleStore","data":{"metadata":{"inner":%q}}}},
			{"type":"write_resource","address":"0x12","data":{"type":"0x1::fungible_asset::FungibleStore","data":{"metadata":{"inner":%q}}}},
			{"type":"write_resource","address":"0x12","data":{"type":"0x1::object::ObjectCore","data":{"owner":%q}}}
		]
	}`, hash, version, timeMS*1000, metadata, metadata, wallet))
}
