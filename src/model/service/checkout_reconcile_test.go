package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/GMWalletApp/epusdt/internal/testutil"
	"github.com/GMWalletApp/epusdt/model/dao"
	"github.com/GMWalletApp/epusdt/model/mdb"
)

func W52Order(id, orderID string, status int) *mdb.Orders {
	return &mdb.Orders{
		TradeId:id,OrderId:orderID,Status:status,
		PaymentType:mdb.PaymentTypeGmpay,PayProvider:mdb.PaymentProviderOnChain,
		Amount:100,Currency:"CNY",Token:"USDT",Network:mdb.NetworkTron,
		ReceiveAddress:"TAddress",ActualAmount:14.28,
	}
}
func TestW52ReadOnlyParentChildStatusAndPaidConfirmation(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	parent:=W52Order("w52_root","w52_order",mdb.StatusWaitPay)
	if err:=dao.Mdb.Create(parent).Error;err!=nil {t.Fatal(err)}
	child:=W52Order("w52_child","w52_sub",mdb.StatusWaitPay)
	child.ParentTradeId=parent.TradeId
	if err:=dao.Mdb.Create(child).Error;err!=nil {t.Fatal(err)}
	view,err:=GetCheckoutReconciliation(parent.TradeId)
	if err!=nil {t.Fatal(err)}
	if view.PaidConfirmed || view.RootStatus!=mdb.StatusWaitPay ||
		view.RelatedTradeID!=child.TradeId || view.RequiresReview {
		t.Fatalf("unexpected waiting parent reconciliation: %+v",view)
	}
	childView,err:=GetCheckoutReconciliation(child.TradeId)
	if err!=nil {t.Fatal(err)}
	if childView.RootTradeID!=parent.TradeId || childView.PaidConfirmed {t.Fatal("child must not infer paid")}
	if err:=dao.Mdb.Model(child).Update("status",mdb.StatusPaySuccess).Error;err!=nil {t.Fatal(err)}
	inconsistent,err:=GetCheckoutReconciliation(child.TradeId)
	if err!=nil {t.Fatal(err)}
	if inconsistent.PaidConfirmed || !inconsistent.RequiresReview {
		t.Fatal("paid child with waiting parent must require review")
	}
	if err:=dao.Mdb.Model(parent).Updates(map[string]interface{}{
		"status":mdb.StatusPaySuccess,"pay_by_sub_id":child.ID,
	}).Error;err!=nil {t.Fatal(err)}
	confirmed,err:=GetCheckoutReconciliation(child.TradeId)
	if err!=nil {t.Fatal(err)}
	if !confirmed.PaidConfirmed || confirmed.RequiresReview {t.Fatalf("should be paid: %+v",confirmed)}
}
func TestW52OkPayLocalProviderLedgerNeverMeansPaidByItself(t *testing.T){
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	order:=W52Order("w52_provider","w52_provider_order",mdb.StatusWaitPay)
	order.PayProvider=mdb.PaymentProviderOkPay
	order.ReceiveAddress="OKPAY"
	if err:=dao.Mdb.Create(order).Error;err!=nil {t.Fatal(err)}
	row:=&mdb.ProviderOrder{TradeId:order.TradeId,Provider:mdb.PaymentProviderOkPay,
		ProviderOrderID:"SENSITIVE_ORDER",PayURL:"https://provider/?token=SECRET",
		Status:mdb.ProviderOrderStatusPaid,Coin:"USDT",NotifyRaw:"raw SECRET"}
	if err:=dao.Mdb.Create(row).Error;err!=nil {t.Fatal(err)}
	view,err:=GetCheckoutReconciliation(order.TradeId)
	if err!=nil {t.Fatal(err)}
	if view.PaidConfirmed || !view.RequiresReview || view.ProviderStatus!="paid" {
		t.Fatalf("provider ledger cannot settle order: %+v",view)
	}
	serialized,err:=json.Marshal(view)
	if err!=nil {t.Fatal(err)}
	for _,key:=range []string{"SECRET","SENSITIVE_ORDER","notify_raw","pay_url","provider_order_id","TAddress"} {
		if strings.Contains(string(serialized),key){t.Fatalf("leaked field: %s",key)}
	}
	// Failed or uncertain external purchase must not create a new order.
	if err:=dao.Mdb.Model(row).Update("status",mdb.ProviderOrderStatusFailed).Error;err!=nil {t.Fatal(err)}
	uncertain,err:=GetCheckoutReconciliation(order.TradeId)
	if err!=nil {t.Fatal(err)}
	if uncertain.PaidConfirmed || !uncertain.RequiresReview {t.Fatal("failed provider still needs review")}
}
func TestW52MissingOrderFailsClosed(t *testing.T){
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	_,err:=GetCheckoutReconciliation("absent_w52")
	if err!=ErrOrder {t.Fatalf("missing order: %v",err)}
}

func TestW52ParentCannotClaimPaidWhileSelectedChildUnsettled(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	root:=W52Order("w52_parent_disagree","w52_parent_disagree_id",mdb.StatusPaySuccess)
	if err:=dao.Mdb.Create(root).Error;err!=nil {t.Fatal(err)}
	child:=W52Order("w52_waiting_child","w52_waiting_child_id",mdb.StatusWaitPay)
	child.ParentTradeId=root.TradeId
	if err:=dao.Mdb.Create(child).Error;err!=nil {t.Fatal(err)}
	view,err:=GetCheckoutReconciliation(root.TradeId)
	if err!=nil {t.Fatal(err)}
	if !view.RequiresReview || view.RelatedTradeID!=child.TradeId {
		t.Fatalf("paid parent with active child must require review: %+v",view)
	}
}
func TestW52PendingProviderDoesNotMarkPaidAndProviderMissingRequiresReview(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	root:=W52Order("w52_okpay_pending","w52_okpay_pending_id",mdb.StatusWaitPay)
	root.PayProvider=mdb.PaymentProviderOkPay
	root.ReceiveAddress="OKPAY"
	if err:=dao.Mdb.Create(root).Error;err!=nil {t.Fatal(err)}
	missing,err:=GetCheckoutReconciliation(root.TradeId)
	if err!=nil {t.Fatal(err)}
	if missing.PaidConfirmed || missing.ProviderStatus!="missing" || !missing.RequiresReview {
		t.Fatalf("missing provider should be flagged: %+v",missing)
	}
	row:=&mdb.ProviderOrder{TradeId:root.TradeId,Provider:mdb.PaymentProviderOkPay,
		Status:mdb.ProviderOrderStatusPending,PayURL:"https://provider/?secret=PRIVATE"}
	if err:=dao.Mdb.Create(row).Error;err!=nil {t.Fatal(err)}
	pending,err:=GetCheckoutReconciliation(root.TradeId)
	if err!=nil {t.Fatal(err)}
	if pending.PaidConfirmed || pending.RequiresReview || pending.ProviderStatus!="pending" {
		t.Fatalf("local pending status is not proof of paid: %+v",pending)
	}
}
