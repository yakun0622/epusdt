package response

// CashierTxVerificationResponse reports evidence verification ONLY.
// The server does not settle an order, invoke a callback, or create any
// payment provider order as part of this response. Never treat this DTO as
// an authoritative paid status (read /pay/reconcile-status instead).
type CashierTxVerificationResponse struct {
	TradeID            string `json:"trade_id"`
	Verification       string `json:"verification"`
	BlockTransactionID string `json:"block_transaction_id"`
}
