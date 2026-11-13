package service

import (
 "testing"
 "time"

 "github.com/GMWalletApp/epusdt/internal/testutil"
 "github.com/GMWalletApp/epusdt/model/dao"
 "github.com/GMWalletApp/epusdt/model/data"
 "github.com/GMWalletApp/epusdt/model/mdb"
 "github.com/GMWalletApp/epusdt/util/constant"
)

// W60 Go tests use temporary primary/runtime SQLite databases. A validator
// stub represents already-verified chain evidence, never a real token transfer.
func TestW60ReadOnlyEvidenceThenAtomicChildSettlementAndSingleCallbackOwner(t *testing.T) {
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 parent:=w54Order("w60_chain_parent",mdb.StatusWaitPay)
 child:=w54Order("w60_chain_child",mdb.StatusWaitPay)
 child.ParentTradeId=parent.TradeId
 child.ReceiveAddress="TW60IsolatedChildReceiver"
 w54Seed(t,parent,child)
 restore:=SetManualOrderPaymentValidatorForTest(func(*mdb.Orders,string)(string,error){
  return "w60_mock_verified_chain_transaction",nil
 })
 defer restore()
 result,err:=VerifyCashierTxHash(child.TradeId,"w60_mock_verified_chain_transaction")
 if err!=nil {t.Fatalf("W53 evidence verification: %v",err)}
 if result.Verification!="verified" {t.Fatalf("unexpected evidence %+v",result)}
 before,err:=GetCheckoutReconciliation(parent.TradeId)
 if err!=nil {t.Fatal(err)}
 if before.PaidConfirmed||before.RequiresReview||before.RootStatus!=mdb.StatusWaitPay {
  t.Fatalf("read-only verification changed settlement %+v",before)
 }
 var claims int64
 if err:=dao.Mdb.Model(&mdb.PaymentTxClaim{}).Count(&claims).Error;err!=nil{t.Fatal(err)}
 if claims!=0 {t.Fatal("verification was not read-only")}
 // Simulate a scanner after its independent contract, recipient, amount and
 // confirmations validation. No HTTP payment, wallet or RPC operation occurs.
 if err:=OrderProcessing(w54Req(child,result.BlockTransactionID));err!=nil {
  t.Fatalf("verified scanner settlement: %v",err)
 }
 parentView,err:=GetCheckoutReconciliation(parent.TradeId)
 if err!=nil {t.Fatal(err)}
 childView,err:=GetCheckoutReconciliation(child.TradeId)
 if err!=nil {t.Fatal(err)}
 if !parentView.PaidConfirmed||!childView.PaidConfirmed||
  parentView.RequiresReview||childView.RequiresReview {
  t.Fatalf("parent-child read failed %+v %+v",parentView,childView)
 }
 root:=w54Load(t,parent.TradeId)
 paidChild:=w54Load(t,child.TradeId)
 if root.PayBySubId!=paidChild.ID||root.CallBackConfirm!=mdb.CallBackConfirmNo||
  paidChild.CallBackConfirm!=mdb.CallBackConfirmOk {
  t.Fatalf("callback owner mismatch root=%+v child=%+v",root,paidChild)
 }
 _,owned,err:=data.ClaimMerchantCallback(dao.Mdb,child.TradeId,"child-lease",time.Now(),2,time.Second)
 if err!=nil||owned{t.Fatalf("child must never send merchant callback: %v, claimed=%v",err,owned)}
 _,owned,err=data.ClaimMerchantCallback(dao.Mdb,parent.TradeId,"owner",time.Now(),2,time.Second)
 if err!=nil||!owned{t.Fatalf("parent must own merchant callback: %v, claimed=%v",err,owned)}
 if ok,err:=data.FinishMerchantCallback(dao.Mdb,parent.TradeId,"owner",true,time.Now());err!=nil||!ok{
  t.Fatalf("callback ack: %v applied=%v",err,ok)
 }
 if err:=OrderProcessing(w54Req(child,result.BlockTransactionID));err!=constant.OrderBlockAlreadyProcess {
  t.Fatalf("duplicate scan result=%v; expected already-used",err)
 }
 parentAgain:=w54Load(t,parent.TradeId)
 if parentAgain.CallbackNum!=1||parentAgain.CallBackConfirm!=mdb.CallBackConfirmOk {
  t.Fatalf("repeat settlement modified merchant callback %+v",parentAgain)
 }
 if err:=dao.Mdb.Model(&mdb.PaymentTxClaim{}).Count(&claims).Error;err!=nil{t.Fatal(err)}
 if claims!=1{t.Fatalf("duplicate chain claim count=%d",claims)}
}

func TestW60ConflictLeavesTransactionAndCallbackPending(t *testing.T) {
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 root:=w54Order("w60_conflict_parent",mdb.StatusExpired)
 child:=w54Order("w60_conflict_child",mdb.StatusWaitPay)
 child.ParentTradeId=root.TradeId
 w54Seed(t,root,child)
 err:=OrderProcessing(w54Req(child,"w60_conflict_simulated_hash"))
 if err!=constant.OrderStatusConflict {t.Fatalf("10010 conflict was not preserved: %v",err)}
 got:=w54Load(t,child.TradeId)
 if got.Status!=mdb.StatusWaitPay||got.CallbackNum!=0||
  got.CallBackConfirm!=mdb.CallBackConfirmNo {
  t.Fatalf("conflict mutated pending child %+v",got)
 }
 var n int64
 if err:=dao.Mdb.Model(&mdb.PaymentTxClaim{}).Count(&n).Error;err!=nil{t.Fatal(err)}
 if n!=0{t.Fatal("conflicted order created a payment claim")}
 _,owned,err:=data.ClaimMerchantCallback(dao.Mdb,root.TradeId,"invalid",time.Now(),2,time.Second)
 if err!=nil||owned{t.Fatalf("conflicted parent was notified: %v %v",owned,err)}
}
