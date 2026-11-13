package mq

import (
 "encoding/json"
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

// W61 merchant transport test: only httptest loopback receives requests.
// This is a merchant that commits its order exactly once by stable delivery
// ID, even if its first response is lost/unacknowledged and Go retries.
// No real merchant URL, provider, or blockchain is contacted.
func TestW61MerchantReceiverOneBusinessEffectAcrossRetryAndUnknownACK(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 callbackLimiter=make(chan struct{},2)
 callbackInflight=sync.Map{}
 const trade="w61_isolated_merchant"
 var mutex sync.Mutex
 seen:=make(map[string]bool)
 var requests atomic.Int32
 var businessEffects atomic.Int32
 var invalid atomic.Int32
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  defer r.Body.Close()
  if r.Method!=http.MethodPost||r.Header.Get("X-Epusdt-Delivery-ID")!=data.MerchantCallbackDeliveryID(trade){
   invalid.Add(1)
   http.Error(w,"bad delivery identity",http.StatusBadRequest)
   return
  }
  var body struct{TradeID string `json:"trade_id"`;Status int `json:"status"`}
  if err:=json.NewDecoder(r.Body).Decode(&body);err!=nil||body.TradeID!=trade||body.Status!=mdb.StatusPaySuccess {
   invalid.Add(1)
   http.Error(w,"bad isolated order",http.StatusBadRequest)
   return
  }
  id:=r.Header.Get("X-Epusdt-Delivery-ID")
  mutex.Lock()
  if !seen[id] {seen[id]=true;businessEffects.Add(1)}
  mutex.Unlock()
  count:=requests.Add(1)
  if count==1{
   // The merchant stored the effect, but epusdt did NOT receive an ACK.
   // The sender must not create a second payment or delivery identity.
   http.Error(w,"reply lost after merchant commit",http.StatusServiceUnavailable)
   return
  }
  _,_=w.Write([]byte("ok"))
 }))
 defer server.Close()
 row:=&mdb.Orders{
  TradeId:trade,OrderId:trade,Status:mdb.StatusPaySuccess,Amount:4,
  ActualAmount:1.25,Currency:"CNY",Token:"USDT",Network:mdb.NetworkTron,
  ReceiveAddress:"W61TestOnlyReceiver",NotifyUrl:server.URL,
  BlockTransactionId:"w61_mock_chain_confirmation",
  CallBackConfirm:mdb.CallBackConfirmNo,PaymentType:mdb.PaymentTypeGmpay,
  PayProvider:mdb.PaymentProviderOnChain,ApiKeyID:1,
 }
 if err:=dao.Mdb.Create(row).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 waitFor(t,3*time.Second,func()bool{
  got,err:=data.GetOrderInfoByTradeId(trade)
  return err==nil&&got.CallbackNum==1&&got.CallBackConfirm==mdb.CallBackConfirmNo
 })
 if businessEffects.Load()!=1{t.Fatalf("first delivery not recorded by isolated merchant")}
 // Force retry scheduler due (W55 backoff); no automatic payment retry.
 if err:=dao.Mdb.Model(&mdb.Orders{}).Where("trade_id = ?",trade).
  UpdateColumn("updated_at",time.Now().Add(-3*time.Second)).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 waitFor(t,3*time.Second,func()bool{
  got,err:=data.GetOrderInfoByTradeId(trade)
  return err==nil&&got.CallbackNum==2&&got.CallBackConfirm==mdb.CallBackConfirmOk
 })
 if requests.Load()!=2||businessEffects.Load()!=1||invalid.Load()!=0 {
  t.Fatalf("attempts=%d merchant effects=%d invalid=%d",
   requests.Load(),businessEffects.Load(),invalid.Load())
 }
 dispatchPendingCallbacks()
 time.Sleep(80*time.Millisecond)
 if requests.Load()!=2{t.Fatal("callback resent after acknowledgment")}
 var delivery mdb.CallbackDelivery
 if err:=dao.Mdb.Where("trade_id = ?",trade).Take(&delivery).Error;err!=nil{t.Fatal(err)}
 if delivery.DeliveredAtMS<=0||delivery.LeaseToken!=""{t.Fatalf("durable delivery state %+v",delivery)}
 got,err:=data.GetOrderInfoByTradeId(trade)
 if err!=nil{t.Fatal(err)}
 if got.Status!=mdb.StatusPaySuccess||got.BlockTransactionId!=row.BlockTransactionId{
  t.Fatalf("merchant retry changed committed payment %+v",got)
 }
}

// A separate loopback HTTP client simulates an ACK timeout while the
// merchant has already stored the side effect. Replays deliberately carry
// the same ID and must never create another side effect. This does not send
// a second real merchant callback or mark any payment as successful.
func TestW61MerchantReceiverTimeoutAndDistinctOrderIsolation(t *testing.T){
 var mu sync.Mutex
 effects:=make(map[string]int)
 var attempts atomic.Int32
 receiver:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  id:=r.Header.Get("X-Epusdt-Delivery-ID")
  if id!="epusdt:w61_timeout_a"&&id!="epusdt:w61_timeout_b"{
   http.Error(w,"invalid id",400);return
  }
  mu.Lock()
  if _,ok:=effects[id];!ok{effects[id]=1}
  mu.Unlock()
  if attempts.Add(1)==1{time.Sleep(150*time.Millisecond)}
  _,_=w.Write([]byte("ok"))
 }))
 defer receiver.Close()
 call:=func(id string,timeout time.Duration)error{
  req,err:=http.NewRequest(http.MethodPost,receiver.URL,nil)
  if err!=nil{return err}
  req.Header.Set("X-Epusdt-Delivery-ID",id)
  client:=&http.Client{Timeout:timeout}
  resp,err:=client.Do(req)
  if err!=nil{return err}
  defer resp.Body.Close()
  if resp.StatusCode!=200{return &w61UnexpectedStatus{code:resp.StatusCode()}}
  return nil
 }
 if err:=call("epusdt:w61_timeout_a",35*time.Millisecond);err==nil{
  t.Fatal("expected local receiver ACK timeout")
 }
 if err:=call("epusdt:w61_timeout_a",time.Second);err!=nil{t.Fatal(err)}
 if err:=call("epusdt:w61_timeout_b",time.Second);err!=nil{t.Fatal(err)}
 mu.Lock();defer mu.Unlock()
 if effects["epusdt:w61_timeout_a"]!=1||effects["epusdt:w61_timeout_b"]!=1||len(effects)!=2{
  t.Fatalf("cross-order duplicate merchant effects %+v",effects)
 }
}
type w61UnexpectedStatus struct{code int}
func (e *w61UnexpectedStatus)Error()string{return http.StatusText(e.code)}
