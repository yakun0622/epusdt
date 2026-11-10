package service

import (
	"strings"
	"time"

	"github.com/GMWalletApp/epusdt/config"
	"github.com/GMWalletApp/epusdt/model/data"
	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/model/response"
)

// GetCheckoutReconciliation reads existing local order/provider state. It
// NEVER contacts OkPay, retries payLink, changes order status, or processes
// callbacks. Only a verified provider callback + the existing settlement
// path may transition an order to StatusPaySuccess.
func GetCheckoutReconciliation(tradeID string) (*response.CheckoutReconcileResponse, error) {
	order, err := data.GetOrderInfoByTradeId(tradeID)
	if err != nil { return nil, err }
	if order.ID == 0 { return nil, ErrOrder }

	root := order
	if order.ParentTradeId != "" {
		root, err = data.GetOrderInfoByTradeId(order.ParentTradeId)
		if err != nil { return nil, err }
		if root.ID == 0 { return nil, ErrOrder }
	}
	resp := &response.CheckoutReconcileResponse{
		TradeID:order.TradeId,
		Status:order.Status,
		RootTradeID:root.TradeId,
		RootStatus:root.Status,
		Provider:"on_chain",
		ServerTime:time.Now().UnixMilli(),
		ExpirationTime:order.CreatedAt.AddMinutes(config.GetOrderExpirationTime()).TimestampMilli(),
	}

	if order.ParentTradeId != "" {
		resp.RelatedTradeID = root.TradeId
		resp.RelatedStatus = root.Status
		if order.Status == mdb.StatusPaySuccess &&
			(root.Status != mdb.StatusPaySuccess || root.PayBySubId != order.ID) {
			resp.RequiresReview = true
		}
		if root.Status == mdb.StatusPaySuccess &&
			root.PayBySubId == order.ID && order.Status != mdb.StatusPaySuccess {
			resp.RequiresReview = true
		}
	} else {
		subs, err := data.GetAllSubOrders(root.TradeId)
		if err != nil { return nil, err }
		if len(subs) > MaxSubOrders {
			resp.RequiresReview = true
		}
		for _, child := range subs {
			if child.Status == mdb.StatusWaitPay {
				// Never select more than one active child for a single parent.
				if resp.RelatedTradeID != "" { resp.RequiresReview = true }
				resp.RelatedTradeID = child.TradeId
				resp.RelatedStatus = child.Status
				if root.Status == mdb.StatusPaySuccess || root.Status == mdb.StatusExpired {
					resp.RequiresReview = true
				}
			}
			if child.Status == mdb.StatusPaySuccess {
				if root.Status != mdb.StatusPaySuccess || root.PayBySubId != child.ID {
					resp.RequiresReview = true
				}
				if resp.RelatedTradeID == "" {
					resp.RelatedTradeID = child.TradeId
					resp.RelatedStatus = child.Status
				}
			}
			if root.PayBySubId != 0 && root.PayBySubId == child.ID {
				resp.RelatedTradeID = child.TradeId
				resp.RelatedStatus = child.Status
				if root.Status == mdb.StatusPaySuccess && child.Status != mdb.StatusPaySuccess {
					resp.RequiresReview = true
				}
			}
		}
		if root.PayBySubId != 0 && resp.RelatedTradeID == "" {
			resp.RequiresReview = true
		}
	}

	// The order row is the sole source of "paid" truth. A provider_status
	// of "paid" by itself is not enough, and any ledger/order discrepancy
	// is surfaced as requiring reconciliation, without exposing provider IDs.
	resp.PaidConfirmed = order.Status == mdb.StatusPaySuccess &&
		(order.ParentTradeId == "" ||
			(root.Status == mdb.StatusPaySuccess && root.PayBySubId == order.ID))
	if order.PayProvider == mdb.PaymentProviderOkPay {
		resp.Provider = mdb.PaymentProviderOkPay
	}
	providerRow, err := data.GetProviderOrderByTradeIDAndProvider(order.TradeId,mdb.PaymentProviderOkPay)
	if err != nil { return nil,err }
	if providerRow.ID != 0 {
		resp.Provider = mdb.PaymentProviderOkPay
		resp.ProviderStatus = strings.ToLower(strings.TrimSpace(providerRow.Status))
		switch resp.ProviderStatus {
		case mdb.ProviderOrderStatusPaid:
			if !resp.PaidConfirmed { resp.RequiresReview=true }
		case mdb.ProviderOrderStatusPending:
			if resp.PaidConfirmed { resp.RequiresReview=true }
		case mdb.ProviderOrderStatusExpired:
			if order.Status != mdb.StatusExpired { resp.RequiresReview=true }
		case mdb.ProviderOrderStatusCreating, mdb.ProviderOrderStatusFailed:
			resp.RequiresReview = true
		default:
			resp.ProviderStatus = "unknown"
			resp.RequiresReview = true
		}
		if order.PayProvider != mdb.PaymentProviderOkPay {
			resp.RequiresReview = true
		}
	} else if order.PayProvider == mdb.PaymentProviderOkPay {
		resp.ProviderStatus = "missing"
		resp.RequiresReview = true
	}
	return resp,nil
}
