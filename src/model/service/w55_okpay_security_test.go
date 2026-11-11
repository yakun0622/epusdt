package service

import (
 "testing"

 "github.com/GMWalletApp/epusdt/internal/testutil"
 "github.com/GMWalletApp/epusdt/model/dao"
 "github.com/GMWalletApp/epusdt/model/data"
 "github.com/GMWalletApp/epusdt/model/mdb"
)

func TestW55OkPayOnlyVerifiedExactAmountAndMatchingProviderCanSettle(t *testing.T){
 cleanup:=testutil.SetupTestDatabases(t);defer cleanup()
 const shop="w55-shop"
 const secret="w55-shop-secret"
 const providerID="w55-okpay-provider-id"
 const trade="w55-verified-notify"
 if err:=data.SetSetting(mdb.SettingGroupOkPay,mdb.SettingKeyOkPayShopID,shop,mdb.SettingTypeString);err!=nil{t.Fatal(err)}
 if err:=data.SetSetting(mdb.SettingGroupOkPay,mdb.SettingKeyOkPayShopToken,secret,mdb.SettingTypeString);err!=nil{t.Fatal(err)}
 order:=&mdb.Orders{
  TradeId:trade,OrderId:trade,Status:mdb.StatusWaitPay,
  Network:mdb.NetworkTron,Token:"USDT",Currency:"CNY",
  ReceiveAddress:"OKPAY",ActualAmount:0.15,Amount:1,
  PayProvider:mdb.PaymentProviderOkPay,
 }
 if err:=dao.Mdb.Create(order).Error;err!=nil{t.Fatal(err)}
 provider:=&mdb.ProviderOrder{
  TradeId:trade,Provider:mdb.PaymentProviderOkPay,ProviderOrderID:providerID,
  Amount:0.15,Coin:"USDT",Status:mdb.ProviderOrderStatusPending,
 }
 if err:=dao.Mdb.Create(provider).Error;err!=nil{t.Fatal(err)}
 for _,tc:=range []struct{name string;mutate func(map[string]string)}{
  {"signature",func(f map[string]string){f["sign"]="wrong"}},
  {"short payment",func(f map[string]string){f["data[amount]"]="0.149999"}},
  {"wrong provider id",func(f map[string]string){f["data[order_id]"]="different";f["sign"]=okPayNotifySign(f,secret)}},
  {"wrong provider coin",func(f map[string]string){f["data[coin]"]="USDC";f["sign"]=okPayNotifySign(f,secret)}},
  {"wrong return code",func(f map[string]string){f["code"]="500";f["sign"]=okPayNotifySign(f,secret)}},
 }{
  t.Run(tc.name,func(t *testing.T){
   f:=okPayNotifyTestForm(shop,secret,providerID,trade,"0.150000","USDT")
   tc.mutate(f)
   if err:=HandleOkPayNotify(f,"bad-notify");err==nil{
    t.Fatal("malformed or mismatching notify was accepted")
   }
   got,err:=data.GetOrderInfoByTradeId(trade)
   if err!=nil{t.Fatal(err)}
   if got.Status!=mdb.StatusWaitPay||got.BlockTransactionId!=""{
    t.Fatalf("unverified notify settled order %+v",got)
   }
   var row mdb.ProviderOrder
   if err:=dao.Mdb.Where("trade_id = ?",trade).Take(&row).Error;err!=nil{t.Fatal(err)}
   if row.Status!=mdb.ProviderOrderStatusPending||row.NotifyRaw!=""{
    t.Fatalf("unverified notify altered provider ledger %+v",row)
   }
   var n int64
   if err:=dao.Mdb.Model(&mdb.PaymentTxClaim{}).Count(&n).Error;err!=nil{t.Fatal(err)}
   if n!=0{t.Fatalf("invalid provider notify inserted %d claims",n)}
  })
 }
 f:=okPayNotifyTestForm(shop,secret,providerID,trade,"0.150000","USDT")
 if err:=HandleOkPayNotify(f,"validated-notify");err!=nil{t.Fatalf("valid notify: %v",err)}
 got,err:=data.GetOrderInfoByTradeId(trade)
 if err!=nil{t.Fatal(err)}
 if got.Status!=mdb.StatusPaySuccess||got.BlockTransactionId!=providerID{
  t.Fatalf("valid provider callback did not settle %+v",got)
 }
 var row mdb.ProviderOrder
 if err:=dao.Mdb.Where("trade_id = ?",trade).Take(&row).Error;err!=nil{t.Fatal(err)}
 if row.Status!=mdb.ProviderOrderStatusPaid||row.NotifyRaw!="validated-notify"{
  t.Fatalf("validated provider payload was not committed atomically %+v",row)
 }
 if err:=HandleOkPayNotify(f,"duplicate-notify");err!=nil{t.Fatalf("identical replay should be safe: %v",err)}
 if err:=dao.Mdb.Where("trade_id = ?",trade).Take(&row).Error;err!=nil{t.Fatal(err)}
 if row.NotifyRaw!="validated-notify"{t.Fatal("duplicate provider callback wrote ledger twice")}
}
