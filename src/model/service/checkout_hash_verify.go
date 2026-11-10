package service

import (
	"errors"
	"strings"
	"time"

	"github.com/GMWalletApp/epusdt/config"
	"github.com/GMWalletApp/epusdt/model/data"
	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/model/response"
	"github.com/GMWalletApp/epusdt/util/constant"
)

// VerifyCashierTxHash only checks chain evidence through the SAME backend
// validator used by the existing manual-payment path. It NEVER invokes
// OrderProcessing, updates order/parent status, or dispatches callbacks.
// The separate legacy submit-tx-hash settlement route is NOT used by W53.
func VerifyCashierTxHash(tradeID, input string) (*response.CashierTxVerificationResponse, error) {
	tradeID, input = strings.TrimSpace(tradeID), strings.TrimSpace(input)
	if input == "" || len(input) > 256 || strings.ContainsAny(input, " \t\r\n") {
		return nil, constant.ParamsMarshalErr
	}
	order, err := GetOrderInfoByTradeId(tradeID)
	if err != nil {
		return nil, err
	}
	if err = guardCashierHashVerification(order); err != nil {
		return nil, err
	}
	// Avoid spending an RPC request on a previously recorded transaction.
	if err = ensureManualBlockTransactionUnused(order, input); err != nil {
		return nil, err
	}
	canonical, err := ValidateManualOrderPayment(order, input)
	if err != nil {
		var rspErr *constant.RspError
		if errors.As(err, &rspErr) {
			return nil, err
		}
		return nil, constant.ManualPaymentVerifyErr
	}
	// The RPC request could take seconds. Re-read status, payment target and
	// linked orders. A changed order is not safely verified for this checkout.
	current, err := GetOrderInfoByTradeId(tradeID)
	if err != nil {
		return nil, err
	}
	if !sameCashierHashTarget(order, current) {
		return nil, constant.OrderStatusConflict
	}
	if err = guardCashierHashVerification(current); err != nil {
		return nil, err
	}
	if err = ensureManualBlockTransactionUnused(current, canonical); err != nil {
		return nil, err
	}
	return &response.CashierTxVerificationResponse{
		TradeID: current.TradeId, Verification: "verified", BlockTransactionID: canonical,
	}, nil
}

func sameCashierHashTarget(previous, current *mdb.Orders) bool {
	return previous != nil && current != nil && previous.ID == current.ID &&
		previous.TradeId == current.TradeId &&
		previous.ParentTradeId == current.ParentTradeId &&
		previous.Status == current.Status &&
		previous.PayBySubId == current.PayBySubId &&
		previous.PayProvider == current.PayProvider &&
		previous.Network == current.Network && previous.Token == current.Token &&
		previous.ReceiveAddress == current.ReceiveAddress &&
		previous.ActualAmount == current.ActualAmount &&
		previous.CreatedAt.TimestampMilli() == current.CreatedAt.TimestampMilli()
}

func guardCashierHashVerification(order *mdb.Orders) error {
	if order == nil || order.ID == 0 {
		return constant.OrderNotExists
	}
	if err := validateManualPaymentOrder(order); err != nil {
		return err
	}
	if order.Network == "" || order.Token == "" || order.ReceiveAddress == "" ||
		order.ActualAmount <= 0 {
		return constant.OrderStatusConflict
	}
	// A deadline exceeded in wall time is NOT database status=3. Refuse to
	// verify while state is ambiguous; do not expire or pay anything.
	if time.Now().UnixMilli() >= order.CreatedAt.AddMinutes(config.GetOrderExpirationTime()).TimestampMilli() {
		return constant.OrderStatusConflict
	}
	reconciliation, err := GetCheckoutReconciliation(order.TradeId)
	if err != nil {
		return err
	}
	if reconciliation.RequiresReview || reconciliation.Status != mdb.StatusWaitPay ||
		reconciliation.RootStatus != mdb.StatusWaitPay {
		return constant.OrderStatusConflict
	}
	if order.ParentTradeId == "" {
		// Once a child was created, the parent address is no longer a safe
		// public verification target, even when that child later expired.
		children, childErr := data.GetAllSubOrders(order.TradeId)
		if childErr != nil {
			return childErr
		}
		if len(children) != 0 || order.PayBySubId != 0 {
			return constant.OrderStatusConflict
		}
		return nil
	}
	root, err := data.GetOrderInfoByTradeId(order.ParentTradeId)
	if err != nil {
		return err
	}
	if root.ID == 0 || root.Status != mdb.StatusWaitPay || root.PayBySubId != 0 {
		return constant.OrderStatusConflict
	}
	if !isOnChainOrder(root.PayProvider) {
		return constant.ManualPaymentProviderErr
	}
	children, err := data.GetAllSubOrders(root.TradeId)
	if err != nil {
		return err
	}
	if len(children) != 1 || children[0].ID != order.ID ||
		children[0].Status != mdb.StatusWaitPay {
		return constant.OrderStatusConflict
	}
	return nil
}
