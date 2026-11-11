package data

import (
 "errors"
 "fmt"
 "strings"
 "time"

 "github.com/GMWalletApp/epusdt/model/mdb"
 "gorm.io/gorm"
 "gorm.io/gorm/clause"
)

const merchantCallbackLeaseDuration = 45 * time.Second

// MerchantCallbackDeliveryID stays identical for all attempts, instances and
// crashes. Merchants should deduplicate by this header and their order ID.
func MerchantCallbackDeliveryID(tradeID string) string { return "epusdt:" + tradeID }

func callbackRetryDuration(attempts int,base time.Duration) time.Duration {
 if attempts<=0{return 0}
 if base<=0{base=time.Second}
 const capDelay=5*time.Minute
 for n:=1;n<attempts;n++ {if base>=capDelay/2{return capDelay};base*=2}
 if base>capDelay{return capDelay}
 return base
}

// validCallbackOwnerTx rejects child callbacks and old partial-payment
// anomalies. Its parent/child/provider check is repeated after HTTP delivery.
func validCallbackOwnerTx(tx *gorm.DB,root *mdb.Orders) (bool,error) {
 if root==nil||root.ID==0||root.Status!=mdb.StatusPaySuccess||
  root.ParentTradeId!=""||root.CallBackConfirm!=mdb.CallBackConfirmNo{return false,nil}
 var child mdb.Orders
 if root.PayBySubId!=0{
  err:=tx.Where("id = ?",root.PayBySubId).Take(&child).Error
  if errors.Is(err,gorm.ErrRecordNotFound){return false,nil}
  if err!=nil{return false,err}
  if child.ParentTradeId!=root.TradeId||child.Status!=mdb.StatusPaySuccess||
   child.CallBackConfirm!=mdb.CallBackConfirmOk||
   strings.TrimSpace(child.BlockTransactionId)=="" {return false,nil}
 }else{
  var n int64
  if err:=tx.Model(&mdb.Orders{}).Where("parent_trade_id = ? AND status = ?",
   root.TradeId,mdb.StatusPaySuccess).Count(&n).Error;err!=nil{return false,err}
  if n>0{return false,nil}
 }
 actual:=root
 if root.PayBySubId!=0{actual=&child}
 if actual.PayProvider==mdb.PaymentProviderOkPay{
  var provider mdb.ProviderOrder
  err:=tx.Where("trade_id = ? AND provider = ?",actual.TradeId,mdb.PaymentProviderOkPay).
   Take(&provider).Error
  if errors.Is(err,gorm.ErrRecordNotFound){return false,nil}
  if err!=nil{return false,err}
  if provider.Status!=mdb.ProviderOrderStatusPaid||
   provider.ProviderOrderID==""||
   provider.ProviderOrderID!=actual.BlockTransactionId{return false,nil}
 }
 return true,nil
}

// ClaimMerchantCallback uses row locking and an atomic lease CAS in the
// primary DB. A local process mutex alone is NOT sufficient.
func ClaimMerchantCallback(db *gorm.DB,tradeID,token string,now time.Time,
 maxRetry int,retryBase time.Duration)(*mdb.Orders,bool,error){
 if strings.TrimSpace(tradeID)==""||strings.TrimSpace(token)==""{
  return nil,false,fmt.Errorf("callback lease requires trade id and token")
 }
 var claimed *mdb.Orders
 err:=db.Transaction(func(tx *gorm.DB)error{
  var root mdb.Orders
  err:=tx.Clauses(clause.Locking{Strength:"UPDATE"}).
   Where("trade_id = ?",tradeID).Take(&root).Error
  if errors.Is(err,gorm.ErrRecordNotFound){return nil}
  if err!=nil{return err}
  valid,err:=validCallbackOwnerTx(tx,&root)
  if err!=nil{return err}
  if !valid||root.CallbackNum>maxRetry{return nil}
  if root.CallbackNum>0&&root.UpdatedAt.StdTime().
   Add(callbackRetryDuration(root.CallbackNum,retryBase)).After(now){return nil}
  if err:=tx.Clauses(clause.OnConflict{DoNothing:true}).
   Create(&mdb.CallbackDelivery{TradeID:root.TradeId}).Error;err!=nil{return err}
  update:=tx.Model(&mdb.CallbackDelivery{}).
   Where("trade_id = ? AND delivered_at_ms = 0 AND lease_until_ms <= ?",
    root.TradeId,now.UnixMilli()).
   Updates(map[string]interface{}{
    "lease_token":token,
    "lease_until_ms":now.Add(merchantCallbackLeaseDuration).UnixMilli(),
   })
  if update.Error!=nil{return update.Error}
  if update.RowsAffected!=1{return nil}
  claimed=&root
  return nil
 })
 return claimed,claimed!=nil,err
}

// FinishMerchantCallback persists the outcome and releases its lease in
// a single SQL transaction. The attempt count is never an independent
// best-effort write that can acknowledge an unrelated callback.
func FinishMerchantCallback(db *gorm.DB,tradeID,token string,acked bool,now time.Time)(bool,error){
 applied:=false
 err:=db.Transaction(func(tx *gorm.DB)error{
  var root mdb.Orders
  err:=tx.Clauses(clause.Locking{Strength:"UPDATE"}).
   Where("trade_id = ?",tradeID).Take(&root).Error
  if errors.Is(err,gorm.ErrRecordNotFound){return nil}
  if err!=nil{return err}
  var delivery mdb.CallbackDelivery
  err=tx.Clauses(clause.Locking{Strength:"UPDATE"}).
   Where("trade_id = ?",tradeID).Take(&delivery).Error
  if errors.Is(err,gorm.ErrRecordNotFound){return nil}
  if err!=nil{return err}
  if delivery.LeaseToken!=token||delivery.LeaseUntilMS==0||
   delivery.DeliveredAtMS>0{return nil}
  valid,err:=validCallbackOwnerTx(tx,&root)
  if err!=nil{return err}
  if !valid{return nil}
  confirmation:=mdb.CallBackConfirmNo
  if acked{confirmation=mdb.CallBackConfirmOk}
  update:=tx.Model(&mdb.Orders{}).
   Where("id = ? AND status = ? AND callback_confirm = ? AND parent_trade_id = ?",
    root.ID,mdb.StatusPaySuccess,mdb.CallBackConfirmNo,"").
   Updates(map[string]interface{}{
    "callback_num":gorm.Expr("callback_num + 1"),
    "callback_confirm":confirmation,
    "updated_at":now,
   })
  if update.Error!=nil{return update.Error}
  if update.RowsAffected!=1{return nil}
  fields:=map[string]interface{}{"lease_token":"","lease_until_ms":int64(0)}
  if acked{fields["delivered_at_ms"]=now.UnixMilli()}
  finalized:=tx.Model(&mdb.CallbackDelivery{}).
   Where("trade_id = ? AND lease_token = ?",tradeID,token).Updates(fields)
  if finalized.Error!=nil{return finalized.Error}
  if finalized.RowsAffected!=1{return fmt.Errorf("callback lease lost during finalization")}
  applied=true
  return nil
 })
 return applied,err
}
