package response

// CheckoutReconcileResponse is the safe, read-only status projection used by
// the public cashier. It contains no merchant URLs, provider order IDs,
// callback payloads, wallet secrets, or payment credentials.
// All timestamps are Unix milliseconds.
type CheckoutReconcileResponse struct {
	TradeID           string `json:"trade_id"`
	Status            int    `json:"status"`
	RootTradeID       string `json:"root_trade_id"`
	RootStatus        int    `json:"root_status"`
	RelatedTradeID    string `json:"related_trade_id"`
	RelatedStatus     int    `json:"related_status"`
	Provider          string `json:"provider"`
	ProviderStatus    string `json:"provider_status"`
	PaidConfirmed     bool   `json:"paid_confirmed"`
	RequiresReview    bool   `json:"requires_review"`
	ServerTime        int64  `json:"server_time"`
	ExpirationTime    int64  `json:"expiration_time"`
}
