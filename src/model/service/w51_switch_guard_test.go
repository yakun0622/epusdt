package service

import (
  "testing"

  "github.com/GMWalletApp/epusdt/internal/testutil"
  "github.com/GMWalletApp/epusdt/model/dao"
  "github.com/GMWalletApp/epusdt/model/data"
  "github.com/GMWalletApp/epusdt/model/mdb"
  "github.com/GMWalletApp/epusdt/model/request"
  "github.com/GMWalletApp/epusdt/util/constant"
)

func TestW51OkPayParentCannotMasqueradeAsTronAddress(t *testing.T) {
  cleanup:=testutil.SetupTestDatabases(t)
  defer cleanup()
  row:=&mdb.Orders{
    TradeId:"provider_parent_w51",OrderId:"provider_order_w51",
    Token:"USDT",Network:mdb.NetworkTron,ReceiveAddress:"OKPAY",
    Status:mdb.StatusWaitPay,PayProvider:mdb.PaymentProviderOkPay,
    PaymentType:mdb.PaymentTypeGmpay,Amount:10,ActualAmount:1,
  }
  if err:=dao.Mdb.Create(row).Error;err!=nil {t.Fatalf("create provider row: %v",err)}
  _,err:=SwitchNetwork(&request.SwitchNetworkRequest{
    TradeId:row.TradeId,Token:"USDT",Network:mdb.NetworkTron,
  })
  if err!=constant.PaymentProviderNotSupport {
    t.Fatalf("same-network provider alias returned %v, want %v",err,constant.PaymentProviderNotSupport)
  }
  _,err=SwitchNetwork(&request.SwitchNetworkRequest{
    TradeId:row.TradeId,Token:"USDT",Network:mdb.NetworkEthereum,
  })
  if err!=constant.PaymentProviderNotSupport {
    t.Fatalf("provider-to-chain mutation returned %v, want %v",err,constant.PaymentProviderNotSupport)
  }
}

func TestW51MaxSubOrdersRemainsOne(t *testing.T){
  if MaxSubOrders!=1 {t.Fatalf("MaxSubOrders = %d, want 1",MaxSubOrders)}
}

func TestW51PlaceholderOkPayNeverReissuesUnknownProviderPurchase(t *testing.T) {
  cleanup:=testutil.SetupTestDatabases(t)
  defer cleanup()
  parent:=&mdb.Orders{
    TradeId:"provider_unknown_w51",OrderId:"provider_unknown_order_w51",
    Status:mdb.StatusWaitSelect,PaymentType:mdb.PaymentTypeGmpay,
    PayProvider:mdb.PaymentProviderOnChain,Amount:100,Currency:"CNY",
  }
  if err:=dao.Mdb.Create(parent).Error;err!=nil {t.Fatalf("create parent: %v",err)}
  previous:=&mdb.ProviderOrder{
    TradeId:parent.TradeId,Provider:mdb.PaymentProviderOkPay,
    ProviderOrderID:"",PayURL:"",Status:mdb.ProviderOrderStatusFailed,
    Coin:"USDT",Amount:14.25,
  }
  if err:=dao.Mdb.Create(previous).Error;err!=nil {t.Fatalf("create previous provider row: %v",err)}
  _,err:=completeWaitSelectOkPayOrder(parent,"USDT")
  if err!=constant.OrderStatusConflict {
    t.Fatalf("unknown prior provider request returned %v, want conflict",err)
  }
  row,err:=data.GetProviderOrderByTradeIDAndProvider(parent.TradeId,mdb.PaymentProviderOkPay)
  if err!=nil {t.Fatal(err)}
  if row.Status!=mdb.ProviderOrderStatusFailed {
    t.Fatalf("previous state overwritten: %q",row.Status)
  }
}
