package data

import (
 "sync"
 "testing"
 "time"

 "github.com/GMWalletApp/epusdt/internal/testutil"
 "github.com/GMWalletApp/epusdt/model/dao"
 "github.com/GMWalletApp/epusdt/model/mdb"
)

func w55PaidOrder(id string)*mdb.Orders{
 return &mdb.Orders{
  TradeId:id,OrderId:id,Status:mdb.StatusPaySuccess,
  Network:mdb.NetworkTron,Token:"USDT",ReceiveAddress:"TRecipientW55",
  ActualAmount:1.5,Amount:10,PayProvider:mdb.PaymentProviderOnChain,
  BlockTransactionId:"tx_"+id,CallBackConfirm:mdb.CallBackConfirmNo,
 }
}
func w55SeedOrder(t *testing.T,o *mdb.Orders){
 t.Helper()
 if err:=dao.Mdb.Create(o).Error;err!=nil{t.Fatal(err)}
}
func w55ReadOrder(t *testing.T,id string)*mdb.Orders{
 t.Helper()
 o,err:=GetOrderInfoByTradeId(id)
 if err!=nil{t.Fatal(err)}
 return o
}

func TestW55ExclusiveLeaseAcrossConcurrentWorkers(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 o:=w55PaidOrder("w55_lease")
 w55SeedOrder(t,o)
 const n=12
 start:=make(chan struct{})
 type result struct{token string;claimed bool;err error}
 ch:=make(chan result,n)
 var wg sync.WaitGroup
 now:=time.Now()
 for i:=0;i<n;i++ {
  wg.Add(1)
  go func(i int){
   defer wg.Done();<-start
   token:=string(rune('a'+i))
   _,claimed,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,token,now,3,time.Second)
   ch<-result{token,claimed,err}
  }(i)
 }
 close(start);wg.Wait();close(ch)
 winner:=""
 for r:=range ch{
  if r.err!=nil{t.Fatalf("claim error=%v",r.err)}
  if r.claimed{
   if winner!=""{t.Fatalf("duplicate active leases: %q and %q",winner,r.token)}
   winner=r.token
  }
 }
 if winner==""{t.Fatal("no winner")}
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"not-owner",true,now);err!=nil||ok{
  t.Fatalf("wrong lease finalized, applied=%v err=%v",ok,err)
 }
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,winner,true,now);err!=nil||!ok{
  t.Fatalf("owner finish applied=%v err=%v",ok,err)
 }
 current:=w55ReadOrder(t,o.TradeId)
 if current.Status!=mdb.StatusPaySuccess||current.CallbackNum!=1||
  current.CallBackConfirm!=mdb.CallBackConfirmOk{t.Fatalf("unexpected result %+v",current)}
 if _,yes,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"again",now.Add(time.Minute),3,time.Second);err!=nil||yes{
  t.Fatalf("completed callback reclaimed: %v err=%v",yes,err)
 }
 if MerchantCallbackDeliveryID(o.TradeId)!="epusdt:"+o.TradeId {t.Fatal("delivery id changed")}
}

func TestW55FailedDeliveryKeepsPaymentAndBackoff(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 o:=w55PaidOrder("w55_retry")
 w55SeedOrder(t,o)
 now:=time.Now()
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"first",now,3,time.Second);err!=nil||!ok{t.Fatalf("claim %v %v",ok,err)}
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"first",false,now);err!=nil||!ok{t.Fatalf("failed result %v %v",ok,err)}
 after:=w55ReadOrder(t,o.TradeId)
 if after.Status!=mdb.StatusPaySuccess||after.CallBackConfirm!=mdb.CallBackConfirmNo||
  after.CallbackNum!=1{t.Fatalf("failed callback changed payment %+v",after)}
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"early",now.Add(200*time.Millisecond),3,time.Second);err!=nil||ok {
  t.Fatalf("retry before backoff %v %v",ok,err)
 }
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"retry",now.Add(2*time.Second),3,time.Second);err!=nil||!ok{
  t.Fatalf("retry due %v %v",ok,err)
 }
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"retry",true,now.Add(2*time.Second));err!=nil||!ok{t.Fatalf("retry ack %v %v",ok,err)}
 final:=w55ReadOrder(t,o.TradeId)
 if final.CallbackNum!=2||final.CallBackConfirm!=mdb.CallBackConfirmOk{t.Fatalf("unexpected ack %+v",final)}
}

func TestW55ExpiredLeaseCanBeReclaimedButOldTokenCannotAck(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 o:=w55PaidOrder("w55_expire_lease");w55SeedOrder(t,o)
 now:=time.Now()
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"old",now,2,time.Second);err!=nil||!ok{t.Fatalf("initial %v %v",ok,err)}
 later:=now.Add(merchantCallbackLeaseDuration+time.Second)
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"new",later,2,time.Second);err!=nil||!ok{t.Fatalf("reclaim %v %v",ok,err)}
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"old",true,later);err!=nil||ok{t.Fatalf("stale ack %v %v",ok,err)}
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"new",true,later);err!=nil||!ok{t.Fatalf("new ack %v %v",ok,err)}
 if w55ReadOrder(t,o.TradeId).CallbackNum!=1{t.Fatal("double callback increment")}
}

func TestW55ParentChildAndProviderContradictionsAreNotNotified(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 root:=w55PaidOrder("w55_orphan_root");w55SeedOrder(t,root)
 child:=w55PaidOrder("w55_orphan_child")
 child.ParentTradeId=root.TradeId
 child.CallBackConfirm=mdb.CallBackConfirmOk
 w55SeedOrder(t,child)
 now:=time.Now()
 for _,id:=range []string{root.TradeId,child.TradeId}{
  if _,ok,err:=ClaimMerchantCallback(dao.Mdb,id,"block",now,2,time.Second);err!=nil||ok{
   t.Fatalf("orphan or child notified %s: ok=%v err=%v",id,ok,err)
  }
 }
 if err:=dao.Mdb.Model(&mdb.Orders{}).Where("trade_id = ?",root.TradeId).
  Update("pay_by_sub_id",child.ID).Error;err!=nil{t.Fatal(err)}
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,root.TradeId,"parent",now,2,time.Second);err!=nil||!ok{
  t.Fatalf("correct parent must notify once %v %v",ok,err)
 }
 if _,err:=FinishMerchantCallback(dao.Mdb,root.TradeId,"parent",true,now);err!=nil{t.Fatal(err)}

 root2:=w55PaidOrder("w55_bad_okpay_root")
 root2.PayProvider=mdb.PaymentProviderOkPay
 root2.BlockTransactionId="okpay_ref"
 w55SeedOrder(t,root2)
 if err:=dao.Mdb.Create(&mdb.ProviderOrder{
  TradeId:root2.TradeId,Provider:mdb.PaymentProviderOkPay,ProviderOrderID:"okpay_ref",
  Status:mdb.ProviderOrderStatusPending,
 }).Error;err!=nil{t.Fatal(err)}
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,root2.TradeId,"provider",now,2,time.Second);err!=nil||ok{
  t.Fatalf("unsettled provider ledger notified %v %v",ok,err)
 }
}

func TestW55CallbackFinalizationDBFailureRollsBackAck(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 o:=w55PaidOrder("w55_rollback")
 w55SeedOrder(t,o)
 now:=time.Now()
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"token",now,2,time.Second);err!=nil||!ok{t.Fatalf("claim %v %v",ok,err)}
 trigger:=`CREATE TRIGGER w55_fail_delivery BEFORE UPDATE OF delivered_at_ms ON callback_delivery
   WHEN NEW.delivered_at_ms > 0
   BEGIN SELECT RAISE(ABORT, 'forced callback ledger failure'); END`
 if err:=dao.Mdb.Exec(trigger).Error;err!=nil{t.Fatal(err)}
 if applied,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"token",true,now);err==nil||applied{
  t.Fatalf("expected injected SQL error applied=%v err=%v",applied,err)
 }
 after:=w55ReadOrder(t,o.TradeId)
 if after.CallBackConfirm!=mdb.CallBackConfirmNo||after.CallbackNum!=0||
  after.Status!=mdb.StatusPaySuccess{t.Fatalf("partial callback persisted %+v",after)}
 var delivery mdb.CallbackDelivery
 if err:=dao.Mdb.Where("trade_id = ?",o.TradeId).Take(&delivery).Error;err!=nil{t.Fatal(err)}
 if delivery.DeliveredAtMS!=0||delivery.LeaseToken!="token"{t.Fatalf("partial delivery persisted %+v",delivery)}
 if err:=dao.Mdb.Exec("DROP TRIGGER w55_fail_delivery").Error;err!=nil{t.Fatal(err)}
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"token",true,now);err!=nil||!ok{
  t.Fatalf("recovery finish %v %v",ok,err)
 }
 if got:=w55ReadOrder(t,o.TradeId).CallbackNum;got!=1{t.Fatalf("attempts=%d",got)}
}

func TestW55RejectsMissingParentAndUnexpectedStatus(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 o:=w55PaidOrder("w55_inactive");o.Status=mdb.StatusWaitPay
 w55SeedOrder(t,o)
 if _,ok,err:=ClaimMerchantCallback(dao.Mdb,o.TradeId,"x",time.Now(),2,time.Second);err!=nil||ok{
  t.Fatalf("pending order got callback lease %v %v",ok,err)
 }
 if ok,err:=FinishMerchantCallback(dao.Mdb,o.TradeId,"x",true,time.Now());err!=nil||ok{
  t.Fatalf("pending order ack %v %v",ok,err)
 }
}
