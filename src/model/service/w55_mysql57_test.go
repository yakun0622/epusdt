package service

import (
 "errors"
 "os"
 "strings"
 "sync"
 "testing"
 "time"

 "github.com/GMWalletApp/epusdt/internal/testutil"
 "github.com/GMWalletApp/epusdt/model/mdb"
 "github.com/GMWalletApp/epusdt/model/data"
 "github.com/GMWalletApp/epusdt/model/dao"
 "github.com/GMWalletApp/epusdt/model/request"
 "github.com/GMWalletApp/epusdt/util/constant"
 gmysql "gorm.io/driver/mysql"
 "gorm.io/gorm"
 "gorm.io/gorm/logger"
 "gorm.io/gorm/schema"
)

func w55OpenMySQL57(t *testing.T) (*gorm.DB,*gorm.DB) {
 t.Helper()
 dsn:=os.Getenv("W55_MYSQL_DSN")
 if dsn==""{t.Skip("W55_MYSQL_DSN absent; this CI integration test requires MySQL 5.7")}
 // NEVER run destructive fixture setup against a production database.
 if !strings.Contains(dsn,"/epusdt_w55_ci?"){t.Fatal("W55_MYSQL_DSN must refer to isolated epusdt_w55_ci")}
 open:=func()*gorm.DB{
  db,err:=gorm.Open(gmysql.Open(dsn),&gorm.Config{
   NamingStrategy:schema.NamingStrategy{SingularTable:true},
   Logger:logger.Default.LogMode(logger.Silent),
  })
  if err!=nil{t.Fatal(err)}
  sqlDB,err:=db.DB();if err!=nil{t.Fatal(err)}
  sqlDB.SetMaxOpenConns(8)
  t.Cleanup(func(){_ = sqlDB.Close()})
  var version string
  if err:=db.Raw("SELECT VERSION()").Scan(&version).Error;err!=nil{t.Fatal(err)}
  if !strings.HasPrefix(version,"5.7."){t.Fatalf("expected MySQL 5.7, got %s",version)}
  return db
 }
 db1,db2:=open(),open()
 // Exercise fresh install AND restart/upgrader, not just a one-off test.
 if err:=dao.MigrateOrdersCompatible(db1);err!=nil{t.Fatalf("MySQL5.7 orders migration: %v",err)}
 if err:=db1.AutoMigrate(&mdb.PaymentTxClaim{},&mdb.ProviderOrder{},&mdb.CallbackDelivery{});err!=nil{t.Fatalf("MySQL5.7 auxiliary migration: %v",err)}
 if err:=dao.MigrateOrdersCompatible(db1);err!=nil{t.Fatalf("MySQL5.7 repeated orders migration: %v",err)}
 return db1,db2
}
func w55MySQLOrder(trade string,status int)*mdb.Orders{
 return &mdb.Orders{TradeId:trade,OrderId:trade,Status:status,Amount:12,
  ActualAmount:1.25,Network:mdb.NetworkTron,Token:"USDT",
  ReceiveAddress:"TW55MySQL57ReceiveAddress",PayProvider:mdb.PaymentProviderOnChain,
  CallBackConfirm:mdb.CallBackConfirmNo,
 }
}
func w55MySQLReq(o *mdb.Orders,txid string)*request.OrderProcessingRequest{
 return &request.OrderProcessingRequest{TradeId:o.TradeId,Network:o.Network,
  Token:o.Token,ReceiveAddress:o.ReceiveAddress,Amount:o.ActualAmount,
  BlockTransactionId:txid}
}

func TestW55MySQL57TwoPoolsAtomicSettlementAndClaim(t *testing.T){
 // Local SQLite only supplies the separate advisory runtime-lock database.
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 db1,db2:=w55OpenMySQL57(t)
 one:=w55MySQLOrder("w55_mysql_a",mdb.StatusWaitPay)
 two:=w55MySQLOrder("w55_mysql_b",mdb.StatusWaitPay)
 for _,o:=range []*mdb.Orders{one,two}{
  if err:=db1.Create(o).Error;err!=nil{t.Fatal(err)}
 }
 t.Cleanup(func(){
  db1.Unscoped().Where("trade_id IN ?",[]string{one.TradeId,two.TradeId}).Delete(&mdb.Orders{})
  db1.Where("trade_id IN ?",[]string{one.TradeId,two.TradeId}).Delete(&mdb.PaymentTxClaim{})
  db1.Where("trade_id IN ?",[]string{one.TradeId,two.TradeId}).Delete(&mdb.CallbackDelivery{})
 })
 opts:=orderProcessingOptions{allowedStatuses:manualPaymentWaitPayStatuses,
  parentAllowedStatuses:manualPaymentWaitPayStatuses}
 const txid="w55_mysql_shared_tx"
 type outcome struct{err error}
 results:=make(chan outcome,2)
 start:=make(chan struct{})
 var wg sync.WaitGroup
 for i,db:=range []*gorm.DB{db1,db2}{
  order:=one;if i==1{order=two}
  wg.Add(1)
  go func(db *gorm.DB,o *mdb.Orders){
   defer wg.Done();<-start
   results<-outcome{settleOrderAtomicallyOnDB(db,w55MySQLReq(o,txid),opts)}
  }(db,order)
 }
 close(start);wg.Wait();close(results)
 success:=0
 for v:=range results {
  if v.err==nil{success++}else if !errors.Is(v.err,constant.OrderBlockAlreadyProcess)&&
   !errors.Is(v.err,constant.OrderStatusConflict){t.Logf("competing transaction was safely aborted: %v",v.err)}
 }
 if success!=1{t.Fatalf("two independent MySQL pools successfully settled %d orders, want 1",success)}
 paid:=0
 for _,o:=range []*mdb.Orders{one,two}{
  var row mdb.Orders
  if err:=db1.Where("trade_id = ?",o.TradeId).Take(&row).Error;err!=nil{t.Fatal(err)}
  if row.Status==mdb.StatusPaySuccess{paid++}
 }
 var claimCount int64
 if err:=db1.Model(&mdb.PaymentTxClaim{}).Where("transaction_id = ?",txid).
  Count(&claimCount).Error;err!=nil{t.Fatal(err)}
 if paid!=1||claimCount!=1{t.Fatalf("paid=%d claims=%d",paid,claimCount)}
}

func TestW55MySQL57TwoPoolsCallbackLease(t *testing.T){
 db1,db2:=w55OpenMySQL57(t)
 o:=w55MySQLOrder("w55_mysql_callback",mdb.StatusPaySuccess)
 o.BlockTransactionId="w55mysqlsettled"
 if err:=db1.Create(o).Error;err!=nil{t.Fatal(err)}
 t.Cleanup(func(){
  db1.Where("trade_id = ?",o.TradeId).Delete(&mdb.CallbackDelivery{})
  db1.Unscoped().Where("trade_id = ?",o.TradeId).Delete(&mdb.Orders{})
 })
 type claim struct{token string;ok bool;err error}
 res:=make(chan claim,2)
 start:=make(chan struct{})
 now:=time.Now()
 var wg sync.WaitGroup
 for i,db:=range []*gorm.DB{db1,db2}{
  token:="instance-one";if i==1{token="instance-two"}
  wg.Add(1)
  go func(db *gorm.DB,token string){
   defer wg.Done();<-start
   _,ok,err:=data.ClaimMerchantCallback(db,o.TradeId,token,now,2,time.Second)
   res<-claim{token,ok,err}
  }(db,token)
 }
 close(start);wg.Wait();close(res)
 win:=""
 for r:=range res{
  if r.err!=nil{t.Fatalf("MySQL callback lease acquisition: %v",r.err)}
  if r.ok {
   if win!=""{t.Fatal("two MySQL connections acquired same callback lease")}
   win=r.token
  }
 }
 if win==""{t.Fatal("neither MySQL instance claimed callback")}
 if ok,err:=data.FinishMerchantCallback(db2,o.TradeId,"other",true,now);err!=nil||ok{
  t.Fatalf("non-owner ack applied=%v err=%v",ok,err)
 }
 if ok,err:=data.FinishMerchantCallback(db1,o.TradeId,win,true,now);err!=nil||!ok{
  t.Fatalf("winner ack applied=%v err=%v",ok,err)
 }
 var current mdb.Orders
 if err:=db2.Where("trade_id = ?",o.TradeId).Take(&current).Error;err!=nil{t.Fatal(err)}
 if current.Status!=mdb.StatusPaySuccess||current.CallbackNum!=1||
  current.CallBackConfirm!=mdb.CallBackConfirmOk {
  t.Fatalf("unexpected callback persistence %+v",current)
 }
}
