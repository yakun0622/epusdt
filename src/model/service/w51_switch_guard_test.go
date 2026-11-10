package service

import (
  "testing"

  "github.com/GMWalletApp/epusdt/internal/testutil"
  "github.com/GMWalletApp/epusdt/model/dao"
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
