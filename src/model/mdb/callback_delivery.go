package mdb

// CallbackDelivery is a durable primary-DB lease to protect merchant callback
// dispatch across API processes. Ambiguous HTTP delivery is at-least-once;
// merchants must deduplicate a stable X-Epusdt-Delivery-ID.
type CallbackDelivery struct {
 TradeID string `gorm:"column:trade_id;size:128;primaryKey"`
 LeaseToken string `gorm:"column:lease_token;size:64;not null;default:''"`
 LeaseUntilMS int64 `gorm:"column:lease_until_ms;not null;default:0"`
 DeliveredAtMS int64 `gorm:"column:delivered_at_ms;not null;default:0"`
}
func (CallbackDelivery) TableName() string{return "callback_delivery"}
