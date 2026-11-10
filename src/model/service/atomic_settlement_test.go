package service

import (
	"strings"
	"sync"
	"testing"

	"github.com/GMWalletApp/epusdt/internal/testutil"
	"github.com/GMWalletApp/epusdt/model/dao"
	"github.com/GMWalletApp/epusdt/model/data"
	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/model/request"
	"github.com/GMWalletApp/epusdt/util/constant"
)

func w54Order(trade string, status int) *mdb.Orders {
	return &mdb.Orders{
		TradeId:trade,OrderId:trade,Status:status,
		Amount:100,ActualAmount:12.5,
		ReceiveAddress:"TTestW54Destination",Network:mdb.NetworkTron,
		Token:"USDT",Currency:"CNY",PayProvider:mdb.PaymentProviderOnChain,
	}
}
func w54Req(order *mdb.Orders,hash string) *request.OrderProcessingRequest {
	return &request.OrderProcessingRequest{
		TradeId:order.TradeId,ReceiveAddress:order.ReceiveAddress,Network:order.Network,
		Token:order.Token,Amount:order.ActualAmount,BlockTransactionId:hash,
	}
}
func w54Seed(t *testing.T,rows ...*mdb.Orders) {
	t.Helper()
	for _,r:=range rows {if err:=dao.Mdb.Create(r).Error;err!=nil {t.Fatal(err)}}
}
func w54Load(t *testing.T,id string) *mdb.Orders {
	t.Helper();row,err:=data.GetOrderInfoByTradeId(id)
	if err!=nil {t.Fatal(err)}
	return row
}
func w54Claims(t *testing.T) int64 {
	t.Helper();var n int64
	if err:=dao.Mdb.Model(&mdb.PaymentTxClaim{}).Count(&n).Error;err!=nil {t.Fatal(err)}
	return n
}

func TestW54AtomicChildParentSuccessAndSingleCallback(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	root:=w54Order("w54_parent",mdb.StatusWaitPay)
	child:=w54Order("w54_child",mdb.StatusWaitPay)
	child.ParentTradeId=root.TradeId
	child.ReceiveAddress="TChildW54Destination"
	w54Seed(t,root,child)
	err:=OrderProcessing(w54Req(child,"abcdef"))
	if err!=nil {t.Fatal(err)}
	p,c:=w54Load(t,root.TradeId),w54Load(t,child.TradeId)
	if p.Status!=mdb.StatusPaySuccess || p.PayBySubId!=c.ID ||
		p.CallBackConfirm!=mdb.CallBackConfirmNo || c.Status!=mdb.StatusPaySuccess ||
		c.CallBackConfirm!=mdb.CallBackConfirmOk || p.BlockTransactionId!="" ||
		c.BlockTransactionId!="abcdef" {t.Fatalf("inconsistent parent/child: %+v %+v",p,c)}
	if w54Claims(t)!=1 {t.Fatal("expected one atomic transaction claim")}
	if err:=OrderProcessing(w54Req(child,"abcdef"));err!=constant.OrderBlockAlreadyProcess {
		t.Fatalf("replayed order error=%v",err)
	}
	if w54Claims(t)!=1 {t.Fatal("replay must not create a claim")}
}

func TestW54ParentConflictRollsBackChildAndClaim(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	root:=w54Order("w54_parent_conflict",mdb.StatusExpired)
	child:=w54Order("w54_child_conflict",mdb.StatusWaitPay)
	child.ParentTradeId=root.TradeId
	w54Seed(t,root,child)
	err:=OrderProcessing(w54Req(child,"abcdef"))
	if err!=constant.OrderStatusConflict {t.Fatalf("err=%v expected 10010",err)}
	if w54Load(t,child.TradeId).Status!=mdb.StatusWaitPay || w54Claims(t)!=0 {
		t.Fatal("child or claim changed despite parent conflict")
	}
	if err:=dao.Mdb.Model(&mdb.Orders{}).Where("trade_id = ?",root.TradeId).
		Update("status",mdb.StatusWaitPay).Error;err!=nil {t.Fatal(err)}
	if err:=OrderProcessing(w54Req(child,"abcdef"));err!=nil {t.Fatal(err)}
	if w54Claims(t)!=1 {t.Fatal("retry should create only one claim")}
}

func TestW54RejectsStaleRequestFieldsWithoutClaim(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	order:=w54Order("w54_fields",mdb.StatusWaitPay)
	w54Seed(t,order)
	for _,test:=range []struct{name string;change func(*request.OrderProcessingRequest)}{
		{"wrong recipient",func(r *request.OrderProcessingRequest){r.ReceiveAddress="TWrongRecipient"}},
		{"wrong network",func(r *request.OrderProcessingRequest){r.Network=mdb.NetworkEthereum}},
		{"wrong token",func(r *request.OrderProcessingRequest){r.Token="USDC"}},
		{"wrong amount",func(r *request.OrderProcessingRequest){r.Amount=12.51}},
	}{
		t.Run(test.name,func(t *testing.T){
			req:=w54Req(order,"abcdef")
			test.change(req)
			if err:=OrderProcessing(req);err!=constant.OrderStatusConflict {t.Fatalf("err=%v",err)}
		})
	}
	if w54Load(t,order.TradeId).Status!=mdb.StatusWaitPay || w54Claims(t)!=0 {
		t.Fatal("changed target claimed a transaction")
	}
}

func TestW54HexAliasesAndHistoricalReplays(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	prior:=w54Order("w54_prior",mdb.StatusPaySuccess)
	prior.BlockTransactionId="0X"+strings.ToUpper(strings.Repeat("a",64))
	next:=w54Order("w54_next",mdb.StatusWaitPay)
	w54Seed(t,prior,next)
	if err:=OrderProcessing(w54Req(next,strings.Repeat("a",64)));err!=constant.OrderBlockAlreadyProcess {
		t.Fatalf("historical 0X alias was accepted: %v",err)
	}
	if w54Claims(t)!=0 {t.Fatal("historical replay must not insert claims")}
	if err:=OrderProcessing(w54Req(next,"0x"+strings.Repeat("b",64)));err!=nil {t.Fatal(err)}
	if w54Load(t,next.TradeId).BlockTransactionId!=strings.Repeat("b",64) {
		t.Fatal("hex transaction was not normalized")
	}
	third:=w54Order("w54_third",mdb.StatusWaitPay)
	w54Seed(t,third)
	if err:=OrderProcessing(w54Req(third,"0X"+strings.ToUpper(strings.Repeat("b",64))));err!=constant.OrderBlockAlreadyProcess {
		t.Fatalf("canonical replay error=%v",err)
	}
}

func TestW54ConcurrentSameHashOnlyOneCommit(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	first:=w54Order("w54_concurrent_one",mdb.StatusWaitPay)
	second:=w54Order("w54_concurrent_two",mdb.StatusWaitPay)
	w54Seed(t,first,second)
	const count=12
	start:=make(chan struct{})
	out:=make(chan error,count)
	var wg sync.WaitGroup
	for i:=0;i<count;i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done();<-start
			order:=first
			if i%2==1 {order=second}
			out<-OrderProcessing(w54Req(order,"w54-shared-hash"))
		}(i)
	}
	close(start);wg.Wait();close(out)
	success:=0
	for err:=range out {
		if err==nil {success++;continue}
		if err!=constant.OrderBlockAlreadyProcess && err!=constant.OrderStatusConflict {
			t.Fatalf("unexpected concurrent settle failure: %v",err)
		}
	}
	if success!=1 || w54Claims(t)!=1 {t.Fatalf("success=%d claims=%d",success,w54Claims(t))}
	paid:=0
	for _,id:=range []string{first.TradeId,second.TradeId} {
		if w54Load(t,id).Status==mdb.StatusPaySuccess {paid++}
	}
	if paid!=1 {t.Fatalf("paid orders=%d, want 1",paid)}
}

func TestW54SiblingProviderExpirationRollsBackWithParent(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	root:=w54Order("w54_parent_provider",mdb.StatusWaitPay)
	okchild:=w54Order("w54_provider_child",mdb.StatusWaitPay)
	okchild.ParentTradeId=root.TradeId
	okchild.PayProvider=mdb.PaymentProviderOkPay
	okchild.ReceiveAddress="OKPAY"
	peer:=w54Order("w54_sibling_chain",mdb.StatusWaitPay)
	peer.ParentTradeId=root.TradeId
	w54Seed(t,root,okchild,peer)
	provider:=&mdb.ProviderOrder{
		TradeId:okchild.TradeId,Provider:mdb.PaymentProviderOkPay,
		ProviderOrderID:"w54-okpay-order",Status:mdb.ProviderOrderStatusPending,
	}
	if err:=dao.Mdb.Create(provider).Error;err!=nil {t.Fatal(err)}
	if err:=OrderProcessing(w54Req(peer,"chainhash"));err!=nil {t.Fatal(err)}
	if w54Load(t,okchild.TradeId).Status!=mdb.StatusExpired {t.Fatal("provider child not expired")}
	var updated mdb.ProviderOrder
	if err:=dao.Mdb.Where("trade_id = ?",okchild.TradeId).Take(&updated).Error;err!=nil {t.Fatal(err)}
	if updated.Status!=mdb.ProviderOrderStatusExpired {t.Fatalf("provider ledger=%s",updated.Status)}
}

func TestW54OkPayLedgerAndOrderCommitTogether(t *testing.T) {
	cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
	o:=w54Order("w54_okpay",mdb.StatusWaitPay)
	o.PayProvider=mdb.PaymentProviderOkPay
	o.ReceiveAddress="OKPAY"
	w54Seed(t,o)
	req:=w54Req(o,"provider-id")
	if err:=OrderProcessing(req);err!=constant.OrderStatusConflict {
		t.Fatalf("missing provider ledger error=%v",err)
	}
	if w54Claims(t)!=0 || w54Load(t,o.TradeId).Status!=mdb.StatusWaitPay {
		t.Fatal("missing provider ledger changed status")
	}
	if err:=dao.Mdb.Create(&mdb.ProviderOrder{
		TradeId:o.TradeId,Provider:mdb.PaymentProviderOkPay,
		ProviderOrderID:"provider-id",Status:mdb.ProviderOrderStatusPending,
	}).Error;err!=nil {t.Fatal(err)}
	if err:=OrderProcessing(req);err!=nil {t.Fatal(err)}
	var provider mdb.ProviderOrder
	if err:=dao.Mdb.Where("trade_id = ?",o.TradeId).Take(&provider).Error;err!=nil {t.Fatal(err)}
	if provider.Status!=mdb.ProviderOrderStatusPaid || w54Load(t,o.TradeId).Status!=mdb.StatusPaySuccess {
		t.Fatal("provider/order commit inconsistent")
	}
}
