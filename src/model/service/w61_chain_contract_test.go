package service

import (
 "math/big"
 "strings"
 "testing"
 "time"

 "github.com/GMWalletApp/epusdt/model/mdb"
 addressutil "github.com/GMWalletApp/epusdt/util/address"
 "github.com/dromara/carbon/v2"
)

// In-memory contract validation, NOT a testnet transaction. Testnet gating
// remains BLOCKED until an actual signed receipt is independently verified.
func TestW61IsolatedMoveTransferContractNetworkTokenAddressAmountAndBlockTime(t *testing.T){
 recipient,err:=addressutil.NormalizeMoveAddress("0xc")
 if err!=nil{t.Fatal(err)}
 base:=&mdb.Orders{
  BaseModel:mdb.BaseModel{ID:1,CreatedAt:*carbon.NewTime(carbon.CreateFromTimestampMilli(time.Now().Add(-time.Minute).UnixMilli()))},
  Network:mdb.NetworkAptos,Token:"USDT",ReceiveAddress:recipient,ActualAmount:3.5,
 }
 event:=MoveObservedTransfer{Network:mdb.NetworkAptos,Token:"USDT",
  ReceiveAddress:strings.ToUpper(recipient),RawAmount:big.NewInt(3_500_000),
  Decimals:6,Amount:3.5,BlockTimeMs:time.Now().UnixMilli()}
 if err:=EnsureMoveTransferMatchesOrder(base,event);err!=nil{
  t.Fatalf("valid synthetic contract event rejected %v",err)
 }
 cases:=[]struct{name string;mutate func(*MoveObservedTransfer);want string}{
  {"wrong network",func(x *MoveObservedTransfer){x.Network=mdb.NetworkTon},"network"},
  {"wrong token",func(x *MoveObservedTransfer){x.Token="USDC"},"token"},
  {"wrong address",func(x *MoveObservedTransfer){x.ReceiveAddress="0xd"},"recipient"},
  {"wrong raw precision",func(x *MoveObservedTransfer){x.RawAmount=big.NewInt(3_400_000)},"amount"},
  {"wrong decimals",func(x *MoveObservedTransfer){x.Decimals=9},"amount"},
  {"transaction before order",func(x *MoveObservedTransfer){x.BlockTimeMs=time.Now().Add(-2*time.Minute).UnixMilli()},"predates"},
  {"missing block timestamp",func(x *MoveObservedTransfer){x.BlockTimeMs=0},"time"},
 }
 for _,tc:=range cases{t.Run(tc.name,func(t *testing.T){
  sample:=event;tc.mutate(&sample)
  err:=EnsureMoveTransferMatchesOrder(base,sample)
  if err==nil||!strings.Contains(err.Error(),tc.want) {
   t.Fatalf("invalid synthetic event accepted or wrong failure %v; expected %s",err,tc.want)
  }
 })}
}
