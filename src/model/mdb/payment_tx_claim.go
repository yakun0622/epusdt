package mdb

// PaymentTxClaim is a database-enforced transaction ownership record.
// Key is SHA-256 of a provider/network-scoped canonical transaction ID.
// Its primary key is globally unique across API instances; it is written
// in the SAME transaction as the paid order and its parent/siblings.
type PaymentTxClaim struct {
	ClaimKey string `gorm:"column:claim_key;type:char(64);primaryKey"`
	TradeID string `gorm:"column:trade_id;size:128;index:idx_payment_tx_claim_trade"`
	Network string `gorm:"column:network;size:32"`
	Provider string `gorm:"column:provider;size:32"`
	TransactionID string `gorm:"column:transaction_id;size:255"`
}

func (PaymentTxClaim) TableName() string { return "payment_tx_claim" }
