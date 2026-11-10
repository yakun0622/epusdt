package service

import (
	"strings"
	"testing"

	"github.com/GMWalletApp/epusdt/internal/testutil"
	"github.com/GMWalletApp/epusdt/model/dao"
	"github.com/GMWalletApp/epusdt/model/data"
	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/util/constant"
)

func w53Order(id string, status int) *mdb.Orders {
	return &mdb.Orders{
		TradeId: id, OrderId: id, Status: status,
		Network: mdb.NetworkTron, Token: "USDT", Currency: "CNY",
		ReceiveAddress: "TValidServerSelectedAddress", ActualAmount: 1.25,
		Amount: 10, PayProvider: mdb.PaymentProviderOnChain,
	}
}

func TestW53ReadOnlyHashVerificationNeverSettlesOrCallsBack(t *testing.T) {
	cleanup := testutil.SetupTestDatabases(t)
	defer cleanup()
	order := w53Order("w53_order", mdb.StatusWaitPay)
	if err := dao.Mdb.Create(order).Error; err != nil { t.Fatal(err) }
	calls := 0
	restore := SetManualOrderPaymentValidatorForTest(func(got *mdb.Orders, raw string) (string, error) {
		calls++
		if got.TradeId != order.TradeId || raw != "abc123" { t.Fatalf("unexpected verification target: %s %s", got.TradeId, raw) }
		return "abc123", nil
	})
	defer restore()
	for i := 0; i < 2; i++ {
		result, err := VerifyCashierTxHash(order.TradeId, " abc123 ")
		if err != nil { t.Fatal(err) }
		if result.TradeID != order.TradeId || result.Verification != "verified" || result.BlockTransactionID != "abc123" {
			t.Fatalf("unexpected verification result: %+v", result)
		}
	}
	if calls != 2 { t.Fatalf("validator called %d times, expected twice", calls) }
	after, err := data.GetOrderInfoByTradeId(order.TradeId)
	if err != nil { t.Fatal(err) }
	if after.Status != mdb.StatusWaitPay || after.BlockTransactionId != "" || after.PayBySubId != 0 || after.CallbackNum != 0 {
		t.Fatalf("verify-only endpoint mutated order: %+v", after)
	}
}

func TestW53RejectsPreviouslyProcessedHashAndDoesNotCallRPC(t *testing.T) {
	cleanup := testutil.SetupTestDatabases(t)
	defer cleanup()
	existing := w53Order("w53_paid", mdb.StatusPaySuccess)
	existing.BlockTransactionId = strings.Repeat("a", 64)
	candidate := w53Order("w53_other", mdb.StatusWaitPay)
	if err := dao.Mdb.Create(existing).Error; err != nil { t.Fatal(err) }
	if err := dao.Mdb.Create(candidate).Error; err != nil { t.Fatal(err) }
	restore := SetManualOrderPaymentValidatorForTest(func(*mdb.Orders, string) (string, error) {
		t.Fatal("must check replay before RPC")
		return "", nil
	})
	defer restore()
	_, err := VerifyCashierTxHash(candidate.TradeId, "0X"+strings.ToUpper(existing.BlockTransactionId))
	if err != constant.OrderBlockAlreadyProcess { t.Fatalf("error=%v, expected 10007", err) }
}

func TestW53BlocksProviderExpiredPlaceholderAndInvalidHash(t *testing.T) {
	cleanup := testutil.SetupTestDatabases(t)
	defer cleanup()
	for _, row := range []struct{id string; status int; provider string; want error}{
		{"w53_provider", mdb.StatusWaitPay, mdb.PaymentProviderOkPay, constant.ManualPaymentProviderErr},
		{"w53_expired", mdb.StatusExpired, mdb.PaymentProviderOnChain, constant.OrderNotWaitPay},
		{"w53_paid", mdb.StatusPaySuccess, mdb.PaymentProviderOnChain, constant.OrderNotWaitPay},
		{"w53_placeholder", mdb.StatusWaitSelect, mdb.PaymentProviderOnChain, constant.OrderNotWaitPay},
	} {
		order := w53Order(row.id, row.status)
		order.PayProvider = row.provider
		if err := dao.Mdb.Create(order).Error; err != nil { t.Fatal(err) }
		_, err := VerifyCashierTxHash(order.TradeId, "abc")
		if err != row.want { t.Fatalf("%s: error=%v want=%v", row.id, err, row.want) }
	}
	_, err := VerifyCashierTxHash("w53_paid", strings.Repeat("a", 257))
	if err != constant.ParamsMarshalErr { t.Fatalf("oversized hash error=%v", err) }
	_, err = VerifyCashierTxHash("w53_paid", "abc def")
	if err != constant.ParamsMarshalErr { t.Fatalf("spaced hash error=%v", err) }
}

func TestW53ParentChildGuardAndChildReadOnlyVerification(t *testing.T) {
	cleanup := testutil.SetupTestDatabases(t)
	defer cleanup()
	root := w53Order("w53_root", mdb.StatusWaitPay)
	if err := dao.Mdb.Create(root).Error; err != nil { t.Fatal(err) }
	child := w53Order("w53_child", mdb.StatusWaitPay)
	child.ParentTradeId = root.TradeId
	if err := dao.Mdb.Create(child).Error; err != nil { t.Fatal(err) }
	restore := SetManualOrderPaymentValidatorForTest(func(*mdb.Orders, string) (string,error) { return "child_hash",nil })
	defer restore()
	if _, err := VerifyCashierTxHash(root.TradeId, "child_hash"); err != constant.OrderStatusConflict {
		t.Fatalf("parent with child verification error=%v",err)
	}
	if _, err := VerifyCashierTxHash(child.TradeId,"child_hash"); err != nil { t.Fatal(err) }
	current, err := data.GetOrderInfoByTradeId(root.TradeId)
	if err != nil { t.Fatal(err) }
	if current.Status != mdb.StatusWaitPay || current.PayBySubId != 0 {
		t.Fatalf("child verification unexpectedly settled parent: %+v",current)
	}
}

func TestW53DetectsStateRaceDuringChainVerification(t *testing.T) {
	cleanup := testutil.SetupTestDatabases(t)
	defer cleanup()
	order := w53Order("w53_race",mdb.StatusWaitPay)
	if err := dao.Mdb.Create(order).Error; err != nil { t.Fatal(err) }
	restore := SetManualOrderPaymentValidatorForTest(func(*mdb.Orders,string)(string,error){
		if err := dao.Mdb.Model(&mdb.Orders{}).Where("trade_id = ?",order.TradeId).
			Update("status",mdb.StatusExpired).Error; err != nil { t.Fatal(err) }
		return "race_hash",nil
	})
	defer restore()
	if _, err := VerifyCashierTxHash(order.TradeId,"race_hash"); err != constant.OrderStatusConflict {
		t.Fatalf("changed order error=%v; want 10010 conflict not expired",err)
	}
}
