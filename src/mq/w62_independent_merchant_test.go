package mq

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
  "os/exec"
  "path/filepath"
  "strings"
  "sync"
  "testing"
  "time"

  "github.com/GMWalletApp/epusdt/internal/testutil"
  "github.com/GMWalletApp/epusdt/model/dao"
  "github.com/GMWalletApp/epusdt/model/data"
  "github.com/GMWalletApp/epusdt/model/mdb"
  "github.com/GMWalletApp/epusdt/model/response"
  "github.com/GMWalletApp/epusdt/util/sign"
)

type w62MerchantJournal struct {
  Version int `json:"version"`
  Requests int `json:"requests"`
  Rejected int `json:"rejected"`
  Orders map[string]struct {
    Binding string `json:"binding"`
    Effects int `json:"effects"`
    Attempts int `json:"attempts"`
  } `json:"orders"`
}
func w62StartMerchant(t *testing.T,stateFile,secret,control string)(string,func()){
 t.Helper()
 script:=filepath.Join("..","..","scripts","w62","merchant-sandbox.mjs")
 ready:=filepath.Join(t.TempDir(),"w62-ready.json")
 node,err:=exec.LookPath("node")
 if err!=nil{t.Fatal("Node 22 must be installed for independent merchant OS process")}
 cmd:=exec.Command(node,script)
 cmd.Env=append(os.Environ(),"W62_ISOLATED=1","W62_MERCHANT_SECRET="+secret,
  "W62_CONTROL_TOKEN="+control,"W62_READY_FILE="+ready,"W62_STATE_FILE="+stateFile,
  "W62_FIRST_ACK_LOST=1")
 output:=new(bytes.Buffer)
 cmd.Stdout=output;cmd.Stderr=output
 if err:=cmd.Start();err!=nil{t.Fatal(err)}
 stopped:=false
 stop:=func(){if stopped{return};stopped=true;_ = cmd.Process.Kill();_ = cmd.Wait()}
 t.Cleanup(stop)
 deadline:=time.Now().Add(8*time.Second)
 for time.Now().Before(deadline){
  content,e:=os.ReadFile(ready)
  if e==nil{
   var event struct{Port int `json:"port"`;Pid int `json:"pid"`}
   if e=json.Unmarshal(content,&event);e==nil&&event.Port>0&&event.Pid==cmd.Process.Pid {
    return fmt.Sprintf("http://127.0.0.1:%d",event.Port),stop
   }
  }
  time.Sleep(25*time.Millisecond)
 }
 stop()
 t.Fatalf("merchant independent server did not start: %s",output.String())
 return "",stop
}
func w62MerchantEvidence(t *testing.T,base,control string)w62MerchantJournal {
 t.Helper()
 req,err:=http.NewRequest(http.MethodGet,base+"/__w62/evidence",nil)
 if err!=nil{t.Fatal(err)}
 req.Header.Set("X-W62-Control",control)
 resp,err:=(&http.Client{Timeout:3*time.Second}).Do(req)
 if err!=nil{t.Fatal(err)}
 defer resp.Body.Close()
 if resp.StatusCode!=200{t.Fatalf("read-only merchant evidence response %d",resp.StatusCode)}
 var journal w62MerchantJournal
 if err:=json.NewDecoder(resp.Body).Decode(&journal);err!=nil{t.Fatal(err)}
 return journal
}
func TestW62IndependentProcessMerchantDeduplicatesSignedCallbacksAcrossRestart(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 callbackLimiter=make(chan struct{},2)
 callbackInflight=sync.Map{}
 const trade="w62_merchant_delivery_restarted"
 const control="w62-local-control"
 const secret="test-token" // only temporary testutil SQLite API key
 stateFile:=filepath.Join(t.TempDir(),"w62-merchant-journal.json")
 first,stop:=w62StartMerchant(t,stateFile,secret,control)
 row:=&mdb.Orders{
  TradeId:trade,OrderId:trade,Status:mdb.StatusPaySuccess,
  Amount:4,ActualAmount:1.25,Token:"USDT",Network:mdb.NetworkTron,
  ReceiveAddress:"W62_ISOLATED_DESTINATION",NotifyUrl:first+"/merchant/notify",
  BlockTransactionId:"w62_isolated_scanner_hash",CallBackConfirm:mdb.CallBackConfirmNo,
  PayProvider:mdb.PaymentProviderOnChain,ApiKeyID:1,
 }
 if err:=dao.Mdb.Create(row).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 waitFor(t,4*time.Second,func()bool{
  got,err:=data.GetOrderInfoByTradeId(trade)
  return err==nil&&got.CallbackNum==1&&got.CallBackConfirm==mdb.CallBackConfirmNo
 })
 before:=w62MerchantEvidence(t,first,control)
 key:=data.MerchantCallbackDeliveryID(trade)
 if before.Orders[key].Effects!=1||before.Orders[key].Attempts!=1{
  t.Fatalf("first attempt did not persist merchant effect: %+v",before)
 }
 stop() // independent merchant process dies after business-side commit
 second,stop2:=w62StartMerchant(t,stateFile,secret,control)
 defer stop2()
 if err:=dao.Mdb.Model(&mdb.Orders{}).Where("trade_id = ?",trade).
  Updates(map[string]interface{}{"notify_url":second+"/merchant/notify",
   "updated_at":time.Now().Add(-3*time.Second)}).Error;err!=nil{t.Fatal(err)}
 dispatchPendingCallbacks()
 waitFor(t,4*time.Second,func()bool{
  got,err:=data.GetOrderInfoByTradeId(trade)
  return err==nil&&got.CallbackNum==2&&got.CallBackConfirm==mdb.CallBackConfirmOk
 })
 after:=w62MerchantEvidence(t,second,control)
 if after.Orders[key].Effects!=1||after.Orders[key].Attempts!=2||
   after.Requests!=2||after.Rejected!=0{
  t.Fatalf("restart repeated business effect or altered callback: %+v",after)
 }
 dispatchPendingCallbacks()
 time.Sleep(100*time.Millisecond)
 final:=w62MerchantEvidence(t,second,control)
 if final.Orders[key].Attempts!=2{t.Fatal("sent third callback after receipt ack")}
 got,err:=data.GetOrderInfoByTradeId(trade)
 if err!=nil{t.Fatal(err)}
 if got.Status!=mdb.StatusPaySuccess||got.BlockTransactionId!=row.BlockTransactionId{
  t.Fatalf("merchant receiver incorrectly changed payment %+v",got)
 }
 var delivered mdb.CallbackDelivery
 if err:=dao.Mdb.Where("trade_id = ?",trade).Take(&delivered).Error;err!=nil{t.Fatal(err)}
 if delivered.DeliveredAtMS==0{t.Fatal("merchant delivery finalization missing")}
 // Deliberately forged signature: the independent merchant must reject it.
 bad:=[]byte(`{"trade_id":"w62_injected","signature":"wrong"}`)
 res,err:=http.Post(second+"/merchant/notify","application/json",bytes.NewReader(bad))
 if err!=nil{t.Fatal(err)}
 _=res.Body.Close()
 if res.StatusCode!=http.StatusForbidden{t.Fatalf("unsigned forged merchant callback %d",res.StatusCode)}
 // Correctly signed but changed order/transaction under the *same* stable
 // delivery ID must be refused instead of applying a second merchant effect.
 forged:=response.OrderNotifyResponse{
  Pid:"test-token",TradeId:trade,OrderId:trade,
  Amount:4,ActualAmount:1.25,ReceiveAddress:"W62_ISOLATED_DESTINATION",
  Token:"USDT",BlockTransactionId:"different_transaction",Status:mdb.StatusPaySuccess,
 }
 sig,err:=sign.GetHMACSHA256(forged,secret)
 if err!=nil{t.Fatal(err)}
 forged.Signature=sig
 payload,err:=json.Marshal(forged)
 if err!=nil{t.Fatal(err)}
 req,err:=http.NewRequest(http.MethodPost,second+"/merchant/notify",bytes.NewReader(payload))
 if err!=nil{t.Fatal(err)}
 req.Header.Set("Content-Type","application/json")
 req.Header.Set("X-Epusdt-Delivery-ID",key)
 reply,err:=(&http.Client{Timeout:3*time.Second}).Do(req)
 if err!=nil{t.Fatal(err)}
 _=reply.Body.Close()
 if reply.StatusCode!=http.StatusConflict{t.Fatalf("same delivery ID with changed transaction response=%d",reply.StatusCode)}
 after= w62MerchantEvidence(t,second,control)
 if after.Orders[key].Effects!=1||after.Rejected!=2 {
  t.Fatalf("forged request changed independent merchant ledger %+v",after)
 }
 if !strings.HasPrefix(second,"http://127.0.0.1:"){t.Fatal("receiver escaped loopback")}
}
