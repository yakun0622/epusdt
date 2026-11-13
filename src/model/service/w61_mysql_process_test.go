package service

import (
 "errors"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "testing"
 "time"

 "github.com/GMWalletApp/epusdt/internal/testutil"
 "github.com/GMWalletApp/epusdt/model/dao"
 "github.com/GMWalletApp/epusdt/model/mdb"
 "github.com/GMWalletApp/epusdt/util/constant"
 "gorm.io/gorm"
)

// This helper is the SAME compiled Go test binary started as a separate OS
// process. The only accepted database name is enforced by w55OpenMySQL57.
// No wallet, blockchain RPC, merchant callback or provider is contacted.
func TestW61MySQLProcessWorker(t *testing.T) {
 role:=os.Getenv("W61_WORKER_ROLE")
 if role==""{return}
 if role!="uncommitted"&&role!="committed"{t.Fatal("unknown isolated worker role")}
 trade:=os.Getenv("W61_WORKER_TRADE")
 hash:=os.Getenv("W61_WORKER_HASH")
 ready:=os.Getenv("W61_WORKER_READY")
 if trade==""||hash==""||ready==""{t.Fatal("incomplete worker configuration")}
 // The external commit simulation still needs an isolated runtime lock DB.
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 db,_:=w55OpenMySQL57(t)
 if role=="uncommitted"{
  tx:=db.Begin()
  if tx.Error!=nil{t.Fatal(tx.Error)}
  // Emulate a process stopped between SQL writes and COMMIT. This is not
  // a claim that the production helper can be interrupted at this line.
  claim:=&mdb.PaymentTxClaim{ClaimKey:settlementClaimKey(mdb.NetworkTron,mdb.PaymentProviderOnChain,hash),
   TradeID:trade,Network:mdb.NetworkTron,Provider:mdb.PaymentProviderOnChain,TransactionID:hash}
  if err:=tx.Create(claim).Error;err!=nil{t.Fatal(err)}
  if err:=tx.Model(&mdb.Orders{}).Where("trade_id = ? AND status = ?",trade,mdb.StatusWaitPay).
   Update("status",mdb.StatusPaySuccess).Error;err!=nil{t.Fatal(err)}
  // Keep the transaction open and let the parent SIGKILL us. MySQL must
  // roll back *both* changes on socket loss.
 }else{
  order:=w55MySQLOrder(trade,mdb.StatusWaitPay)
  opts:=orderProcessingOptions{allowedStatuses:manualPaymentWaitPayStatuses,
   parentAllowedStatuses:manualPaymentWaitPayStatuses}
  if err:=settleOrderAtomicallyOnDB(db,w55MySQLReq(order,hash),opts);err!=nil{t.Fatal(err)}
  // COMMIT already succeeded. Parent intentionally never observes the
  // HTTP/process success response before it terminates this worker.
 }
 if err:=os.WriteFile(ready,[]byte(role),0600);err!=nil{t.Fatal(err)}
 for {time.Sleep(time.Second)} // forcibly terminated by parent; no retry or callback
}

func w61CrashWorker(t *testing.T,role,trade,hash string) {
 t.Helper()
 if os.Getenv("W55_MYSQL_DSN")==""{t.Skip("requires isolated MySQL5.7 service")}
 ready:=filepath.Join(t.TempDir(),"ready")
 output:=filepath.Join(t.TempDir(),"worker.log")
 f,err:=os.Create(output);if err!=nil{t.Fatal(err)}
 defer f.Close()
 cmd:=exec.Command(os.Args[0],"-test.run=^TestW61MySQLProcessWorker$","-test.v")
 cmd.Env=append(os.Environ(),
  "W61_WORKER_ROLE="+role,"W61_WORKER_TRADE="+trade,
  "W61_WORKER_HASH="+hash,"W61_WORKER_READY="+ready)
 cmd.Stdout=f;cmd.Stderr=f
 if err:=cmd.Start();err!=nil{t.Fatal(err)}
 terminated:=false
 defer func(){
  if !terminated&&cmd.Process!=nil{_ = cmd.Process.Kill();_ = cmd.Wait()}
 }()
 deadline:=time.Now().Add(18*time.Second)
 for time.Now().Before(deadline){
  if raw,err:=os.ReadFile(ready);err==nil&&string(raw)==role{break}
  time.Sleep(20*time.Millisecond)
 }
 if raw,err:=os.ReadFile(ready);err!=nil||string(raw)!=role{
  logs,_:=os.ReadFile(output)
  t.Fatalf("worker did not reach %s checkpoint: %v\n%s",role,err,strings.TrimSpace(string(logs)))
 }
 if err:=cmd.Process.Kill();err!=nil{t.Fatalf("kill worker: %v",err)}
 _=cmd.Wait()
 terminated=true
}

func w61GetMySQLOrder(t *testing.T,db *gorm.DB,trade string)*mdb.Orders{
 t.Helper()
 var o mdb.Orders
 if err:=db.Where("trade_id = ?",trade).Take(&o).Error;err!=nil{t.Fatal(err)}
 return &o
}
func w61AssertMySQLClaim(t *testing.T,db *gorm.DB,trade string,expected int64){
 t.Helper()
 var n int64
 if err:=db.Model(&mdb.PaymentTxClaim{}).Where("trade_id = ?",trade).Count(&n).Error;err!=nil{t.Fatal(err)}
 if n!=expected{t.Fatalf("isolated DB claim count for %s = %d want %d",trade,n,expected)}
}
func w61CleanMySQL(t *testing.T,db *gorm.DB,trade string){
 t.Helper()
 t.Cleanup(func(){
  db.Where("trade_id = ?",trade).Delete(&mdb.CallbackDelivery{})
  db.Where("trade_id = ?",trade).Delete(&mdb.PaymentTxClaim{})
  db.Unscoped().Where("trade_id = ?",trade).Delete(&mdb.Orders{})
 })
}

func TestW61MySQL57KilledUncommittedWorkerRollsBackAndReadAllowsSafeNewAttempt(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 db1,db2:=w55OpenMySQL57(t)
 trade:=fmt.Sprintf("w61_uncommitted_%d",time.Now().UnixNano())
 hash:="w61_uncommitted_hash_"+trade
 row:=w55MySQLOrder(trade,mdb.StatusWaitPay)
 if err:=db1.Create(row).Error;err!=nil{t.Fatal(err)}
 w61CleanMySQL(t,db1,trade)
 w61CrashWorker(t,"uncommitted",trade,hash)
 // A crash is NOT proof of payment. Verify the persisted SQL state.
 // MySQL may need a moment to disconnect and release the killed socket.
 var current *mdb.Orders
 deadline:=time.Now().Add(6*time.Second)
 for time.Now().Before(deadline){
  current=w61GetMySQLOrder(t,db2,trade)
  if current.Status==mdb.StatusWaitPay{break}
  time.Sleep(25*time.Millisecond)
 }
 if current.Status!=mdb.StatusWaitPay||current.BlockTransactionId!=""||
  current.CallbackNum!=0||current.CallBackConfirm!=mdb.CallBackConfirmNo{
  t.Fatalf("uncommitted crash partially settled order %+v",current)
 }
 w61AssertMySQLClaim(t,db2,trade,0)
 opts:=orderProcessingOptions{allowedStatuses:manualPaymentWaitPayStatuses,
  parentAllowedStatuses:manualPaymentWaitPayStatuses}
 if err:=settleOrderAtomicallyOnDB(db2,w55MySQLReq(row,hash),opts);err!=nil{
  t.Fatalf("explicit safe transaction after checking rollback: %v",err)
 }
 current=w61GetMySQLOrder(t,db2,trade)
 if current.Status!=mdb.StatusPaySuccess||current.BlockTransactionId!=hash{
  t.Fatalf("verified subsequent settle missing %+v",current)
 }
 w61AssertMySQLClaim(t,db1,trade,1)
}

func TestW61MySQL57CommittedButResponseLostNeverReplaysSettlement(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 db1,db2:=w55OpenMySQL57(t)
 trade:=fmt.Sprintf("w61_committed_%d",time.Now().UnixNano())
 hash:="w61_committed_hash_"+trade
 row:=w55MySQLOrder(trade,mdb.StatusWaitPay)
 if err:=db1.Create(row).Error;err!=nil{t.Fatal(err)}
 w61CleanMySQL(t,db1,trade)
 w61CrashWorker(t,"committed",trade,hash)
 // Response disappeared when we killed the worker AFTER COMMIT. Read SQL;
 // never interpret a process/network timeout as an unpaid new order.
 current:=w61GetMySQLOrder(t,db2,trade)
 if current.Status!=mdb.StatusPaySuccess||current.BlockTransactionId!=hash||
  current.CallBackConfirm!=mdb.CallBackConfirmNo||current.CallbackNum!=0{
  t.Fatalf("durable commit lost or generated duplicate callback %+v",current)
 }
 w61AssertMySQLClaim(t,db1,trade,1)
 opts:=orderProcessingOptions{allowedStatuses:manualPaymentWaitPayStatuses,
  parentAllowedStatuses:manualPaymentWaitPayStatuses}
 err:=settleOrderAtomicallyOnDB(db1,w55MySQLReq(row,hash),opts)
 if !errors.Is(err,constant.OrderBlockAlreadyProcess) {
  t.Fatalf("unknown-commit recovery must not settle again, got %v",err)
 }
 w61AssertMySQLClaim(t,db2,trade,1)
 current=w61GetMySQLOrder(t,db2,trade)
 if current.CallbackNum!=0||current.CallBackConfirm!=mdb.CallBackConfirmNo{
  t.Fatalf("replayed transaction altered callback ledger %+v",current)
 }
}
