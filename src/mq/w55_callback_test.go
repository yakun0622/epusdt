package mq

import (
 "net/http"
 "net/http/httptest"
 "sync"
 "sync/atomic"
 "testing"
 "time"

 "github.com/GMWalletApp/epusdt/internal/testutil"
 "github.com/GMWalletApp/epusdt/model/dao"
 "github.com/GMWalletApp/epusdt/model/data"
 "github.com/GMWalletApp/epusdt/model/mdb"
)

func TestW55CallbackStableDeliveryIDAcrossRetryAndNoDuplicatePaidState(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 callbackLimiter=make(chan struct{},2)
 callbackInflight=sync.Map{}
 var attempts atomic.Int32
 var badHeaders atomic.Int32
 const trade="w55_worker_retry"
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  if r.Header.Get("X-Epusdt-Delivery-Id")!=data.MerchantCallbackDeliveryID(trade){
   badHeaders.Add(1)
  }
  if attempts.Add(1)==1 {
   http.Error(w,"temporary failure",http.StatusServiceUnavailable)
   return
  }
  _,_ = w.Write([]byte("ok"))
 }))
 defer server.Close()
 o:=&mdb.Orders{
  TradeId:trade,OrderId:trade,Status:mdb.StatusPaySuccess,Amount:4,
  ActualAmount:1.25,Token:"USDT",Network:mdb.NetworkTron,
  ReceiveAddress:"TW55Recipient",NotifyUrl:server.URL,
  BlockTransactionId:"w55_sender_chain_hash",CallBackConfirm:mdb.CallBackConfirmNo,
  PayProvider:mdb.PaymentProviderOnChain,ApiKeyID:1,
 }
 if err:=dao.Mdb.Create(o).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 waitFor(t,3*time.Second,func()bool{
  v,err:=data.GetOrderInfoByTradeId(trade)
  return err==nil&&v.CallbackNum==1&&v.CallBackConfirm==mdb.CallBackConfirmNo
 })
 if err:=dao.Mdb.Model(&mdb.Orders{}).Where("trade_id = ?",trade).
  UpdateColumn("updated_at",time.Now().Add(-2*time.Second)).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 waitFor(t,3*time.Second,func()bool{
  v,err:=data.GetOrderInfoByTradeId(trade)
  return err==nil&&v.CallbackNum==2&&v.CallBackConfirm==mdb.CallBackConfirmOk
 })
 dispatchPendingCallbacks()
 time.Sleep(100*time.Millisecond)
 if attempts.Load()!=2||badHeaders.Load()!=0{
  t.Fatalf("deliveries=%d invalid headers=%d",attempts.Load(),badHeaders.Load())
 }
 var delivery mdb.CallbackDelivery
 if err:=dao.Mdb.Where("trade_id = ?",trade).Take(&delivery).Error;err!=nil{t.Fatal(err)}
 if delivery.DeliveredAtMS==0||delivery.LeaseToken!=""{
  t.Fatalf("missing durable delivered state %+v",delivery)
 }
 if v,err:=data.GetOrderInfoByTradeId(trade);err!=nil||v.Status!=mdb.StatusPaySuccess {
  t.Fatalf("callback affected payment status %v %+v",err,v)
 }
}

func TestW55OrphanPaidChildCannotTriggerMerchantCallback(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 callbackLimiter=make(chan struct{},2)
 callbackInflight=sync.Map{}
 var requests atomic.Int32
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  requests.Add(1);_,_ = w.Write([]byte("ok"))
 }))
 defer server.Close()
 root:=&mdb.Orders{
  TradeId:"w55_orphan_merchant_root",OrderId:"w55_orphan_merchant_root",
  Status:mdb.StatusPaySuccess,BlockTransactionId:"",
  CallBackConfirm:mdb.CallBackConfirmNo,NotifyUrl:server.URL,ApiKeyID:1,
 }
 if err:=dao.Mdb.Create(root).Error;err!=nil{t.Fatal(err)}
 child:=&mdb.Orders{
  TradeId:"w55_orphan_merchant_child",OrderId:"w55_orphan_merchant_child",
  ParentTradeId:root.TradeId,Status:mdb.StatusPaySuccess,
  BlockTransactionId:"chain_hash",CallBackConfirm:mdb.CallBackConfirmNo,
  NotifyUrl:server.URL,ApiKeyID:1,
 }
 if err:=dao.Mdb.Create(child).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 time.Sleep(150*time.Millisecond)
 if requests.Load()!=0{t.Fatalf("orphan or child sent %d callbacks",requests.Load())}
 if row,err:=data.GetOrderInfoByTradeId(root.TradeId);err!=nil||row.CallBackConfirm!=mdb.CallBackConfirmNo{
  t.Fatalf("orphan callback state altered err=%v row=%+v",err,row)
 }
}
