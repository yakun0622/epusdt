package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/GMWalletApp/epusdt/model/dao"
	"github.com/GMWalletApp/epusdt/model/data"
	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/model/request"
	"github.com/GMWalletApp/epusdt/util/constant"
	"github.com/GMWalletApp/epusdt/util/log"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// settlementTxID removes spelling aliases for hex transaction IDs, but never
// case-folds TON/Solana references or provider order IDs.
func settlementTxID(network, provider, transaction string) string {
	transaction = strings.TrimSpace(transaction)
	if provider != "" && provider != mdb.PaymentProviderOnChain {
		return transaction
	}
	if !manualBlockTransactionIDIsHex(network) {return transaction}
	body := strings.TrimPrefix(strings.TrimPrefix(transaction, "0x"), "0X")
	// Only normalize genuinely hexadecimal identifiers. Historical tests
	// and records can contain opaque provider/scanner references; inventing
	// a 0x prefix for an arbitrary string would change its identity.
	if len(body) == 64 {
		if _, err := hex.DecodeString(body); err == nil {
			if strings.EqualFold(network,mdb.NetworkTron) {return strings.ToLower(body)}
			return "0x" + strings.ToLower(body)
		}
	}
	// Aptos (and EVM) can have short RPC test IDs with an explicit 0x
	// prefix; preserve that prefix and its canonical lowercase spelling.
	if !strings.EqualFold(network,mdb.NetworkTron) &&
		(strings.HasPrefix(transaction,"0x") || strings.HasPrefix(transaction,"0X")) {
		return "0x" + strings.ToLower(body)
	}
	return transaction
}

func settlementClaimKey(network, provider, transaction string) string {
	if provider == "" { provider = mdb.PaymentProviderOnChain }
	scope := strings.ToLower(strings.TrimSpace(provider))+":"+strings.ToLower(strings.TrimSpace(network))
	sum := sha256.Sum256([]byte(scope+"\x00"+settlementTxID(network,provider,transaction)))
	return hex.EncodeToString(sum[:])
}

// Requests from scanners are authoritative observed-chain events; manual
// callers MUST have already run ValidateManualOrderPayment. This guard binds
// either input to the exact persisted order, preventing stale address/token
// or amount from settling a different order under a concurrent network switch.
func matchingSettlementTarget(order *mdb.Orders, req *request.OrderProcessingRequest) bool {
	if order == nil || req == nil { return false }
	if !strings.EqualFold(strings.TrimSpace(order.Network),strings.TrimSpace(req.Network)) ||
		!strings.EqualFold(strings.TrimSpace(order.Token),strings.TrimSpace(req.Token)) ||
		normalizeOrderAddressByNetwork(order.Network,order.ReceiveAddress) !=
		normalizeOrderAddressByNetwork(req.Network,req.ReceiveAddress) {
		return false
	}
	return order.ActualAmount > 0 && req.Amount > 0 &&
		decimal.NewFromFloat(order.ActualAmount).Equal(decimal.NewFromFloat(req.Amount))
}

func lockSettlementOrder(tx *gorm.DB, tradeID string) (*mdb.Orders,error) {
	var order mdb.Orders
	err := tx.Clauses(clause.Locking{Strength:"UPDATE"}).
		Where("trade_id = ?",tradeID).Take(&order).Error
	if errors.Is(err,gorm.ErrRecordNotFound) {return nil,constant.OrderStatusConflict}
	if err != nil {return nil,err}
	return &order,nil
}

// legacyTxAlreadyUsed protects historical orders created before W54. Claims
// protect new writes. Keep lookup in the same transaction and normalize hex
// aliases to defeat case/prefix replays even with a case-sensitive DB collation.
func legacyTxAlreadyUsed(tx *gorm.DB, order *mdb.Orders, canonical string) (bool,error) {
	var n int64
	candidates := equivalentManualBlockTransactionIDs(order.Network,canonical)
	// Historical paid orders may have been soft-deleted by an admin.
	// Never allow their transaction IDs to be claimed a second time.
	q := tx.Unscoped().Model(&mdb.Orders{}).Where("block_transaction_id != ''")
	if order.PayProvider == "" || order.PayProvider == mdb.PaymentProviderOnChain {
		q = q.Where("(pay_provider = ? OR pay_provider = '' OR pay_provider IS NULL)",mdb.PaymentProviderOnChain)
		if manualBlockTransactionIDIsHex(order.Network) {
			q = q.Where("LOWER(block_transaction_id) IN ?",lowerSettlementCandidates(candidates))
		} else {
			q = q.Where("block_transaction_id IN ?",candidates)
		}
	} else {
		q = q.Where("pay_provider = ? AND block_transaction_id = ?",order.PayProvider,canonical)
	}
	if err := q.Count(&n).Error; err != nil {return false,err}
	return n>0,nil
}

func lowerSettlementCandidates(ids []string) []string {
	out:=make([]string,0,len(ids))
	for _,id:=range ids {out=append(out,strings.ToLower(id))}
	return out
}

// settleOrderAtomically ensures that an order is never paid without its
// corresponding parent/child state and transaction claim. Concurrent workers
// serialize on the parent FOR UPDATE lock (MySQL/Postgres). The unique
// claim_key handles cross-process replay and collision across instances.
func settleOrderAtomically(req *request.OrderProcessingRequest, opts orderProcessingOptions) error {
	if req == nil || strings.TrimSpace(req.TradeId)=="" ||
		strings.TrimSpace(req.BlockTransactionId)=="" {return constant.ParamsMarshalErr}
	var unlockOrders []mdb.Orders
	err := dao.Mdb.Transaction(func(tx *gorm.DB) error {
		// Resolve the parent identity before locking, then lock parent first
		// to use a consistent lock order with competing child settlements.
		var preliminary mdb.Orders
		if err:=tx.Where("trade_id = ?",req.TradeId).Take(&preliminary).Error;err!=nil {
			if errors.Is(err,gorm.ErrRecordNotFound) {return constant.OrderStatusConflict}
			return err
		}
		rootID:=preliminary.TradeId
		if preliminary.ParentTradeId!="" {rootID=preliminary.ParentTradeId}
		root,err:=lockSettlementOrder(tx,rootID)
		if err!=nil{return err}
		order:=root
		if preliminary.ParentTradeId!="" {
			order,err=lockSettlementOrder(tx,req.TradeId)
			if err!=nil{return err}
			if order.ParentTradeId!=root.TradeId {return constant.OrderStatusConflict}
		}
		if !manualPaymentStatusAllowed(order.Status,opts.allowedStatuses) ||
			!manualPaymentStatusAllowed(root.Status,opts.parentAllowedStatuses) {
			// Already-settled records never trigger callback again.
			if order.Status==mdb.StatusPaySuccess &&
				settlementTxID(order.Network,order.PayProvider,order.BlockTransactionId)==
				settlementTxID(order.Network,order.PayProvider,req.BlockTransactionId) {
				return constant.OrderBlockAlreadyProcess
			}
			return constant.OrderStatusConflict
		}
		if !matchingSettlementTarget(order,req) {return constant.OrderStatusConflict}
		canonical:=settlementTxID(order.Network,order.PayProvider,req.BlockTransactionId)
		if canonical=="" {return constant.ParamsMarshalErr}
		// A legacy row could already own the transaction, including the
		// same order (replay). Never swallow or mark unrelated callbacks.
		used,err:=legacyTxAlreadyUsed(tx,order,canonical)
		if err!=nil{return err}
		if used{return constant.OrderBlockAlreadyProcess}
		claim:=&mdb.PaymentTxClaim{ClaimKey:settlementClaimKey(order.Network,order.PayProvider,canonical),
			TradeID:order.TradeId,Network:strings.ToLower(order.Network),
			Provider:order.PayProvider,TransactionID:canonical}
		result:=tx.Clauses(clause.OnConflict{DoNothing:true}).Create(claim)
		if result.Error!=nil {return result.Error}
		if result.RowsAffected!=1 {return constant.OrderBlockAlreadyProcess}

		// Ensure callback ownership is decided in this transaction, not
		// repaired later by a separate read/update.
		callback:=mdb.CallBackConfirmNo
		if order.ParentTradeId!="" {callback=mdb.CallBackConfirmOk}
		paid:=tx.Model(&mdb.Orders{}).Where("id = ? AND status IN ?",
			order.ID,opts.allowedStatuses).Updates(map[string]interface{}{
				"status":mdb.StatusPaySuccess,
				"block_transaction_id":canonical,
				"callback_confirm":callback,
			})
		if paid.Error!=nil {return paid.Error}
		if paid.RowsAffected!=1{return constant.OrderStatusConflict}

		// The parent and all its other children must be finalized before
		// the claim is committed. A rollback leaves ALL records unchanged.
		if order.ParentTradeId!="" {
			parent:=tx.Model(&mdb.Orders{}).
				Where("id = ? AND status IN ? AND pay_by_sub_id = 0",root.ID,opts.parentAllowedStatuses).
				Updates(map[string]interface{}{
					"status":mdb.StatusPaySuccess,
					"callback_confirm":mdb.CallBackConfirmNo,
					"pay_by_sub_id":order.ID,
				})
			if parent.Error!=nil{return parent.Error}
			if parent.RowsAffected!=1{return constant.OrderStatusConflict}
		}
		var siblings []mdb.Orders
		if err:=tx.Where("parent_trade_id = ? AND trade_id != ? AND status = ?",
			root.TradeId,order.TradeId,mdb.StatusWaitPay).Find(&siblings).Error;err!=nil{return err}
		if order.ParentTradeId=="" {
			if err:=tx.Where("parent_trade_id = ? AND status = ?",root.TradeId,mdb.StatusWaitPay).
				Find(&siblings).Error;err!=nil{return err}
		}
		if len(siblings)>0 {
			if err:=tx.Model(&mdb.Orders{}).Where("parent_trade_id = ? AND status = ? AND id != ?",
				root.TradeId,mdb.StatusWaitPay,order.ID).
				Update("status",mdb.StatusExpired).Error;err!=nil{return err}
			for _,s:=range siblings {
				if s.PayProvider!=""&&s.PayProvider!=mdb.PaymentProviderOnChain {
					if err:=tx.Model(&mdb.ProviderOrder{}).
						Where("trade_id = ? AND provider = ? AND status IN ?",s.TradeId,s.PayProvider,
							[]string{mdb.ProviderOrderStatusCreating,mdb.ProviderOrderStatusPending}).
						Update("status",mdb.ProviderOrderStatusExpired).Error;err!=nil{return err}
				}
			}
		}
		// Provider payment ledger and SQL order must not diverge as a
		// result of our own settlement. Verified OkPay callback is the
		// only provider path into this function; no provider HTTP calls.
		if order.PayProvider==mdb.PaymentProviderOkPay {
			provider:=tx.Model(&mdb.ProviderOrder{}).
				Where("trade_id = ? AND provider = ? AND provider_order_id = ? AND status IN ?",
					order.TradeId,mdb.PaymentProviderOkPay,req.BlockTransactionId,
					[]string{mdb.ProviderOrderStatusPending,mdb.ProviderOrderStatusCreating}).
				Update("status",mdb.ProviderOrderStatusPaid)
			if provider.Error!=nil{return provider.Error}
			if provider.RowsAffected!=1{return constant.OrderStatusConflict}
		}
		unlockOrders=append(unlockOrders,*order)
		if order.ParentTradeId!="" {unlockOrders=append(unlockOrders,*root)}
		unlockOrders=append(unlockOrders,siblings...)
		return nil
	})
	if err!=nil{return err}
	// Runtime SQLite locks are advisory and live in a separate DB; clean up
	// after the authoritative primary commit, never while it is uncommitted.
	// If cleanup fails, the order is already paid and the retry sweep must
	// reclaim locks without emitting another notification.
	for i:=range unlockOrders {
		item:=&unlockOrders[i]
		if !hasTransactionLock(item) {continue}
		// Delete by trade ID, never by address/amount: a delayed cleanup
		// must not remove a newer order's reallocated amount lock.
		if err:=data.UnLockTransactionByTradeId(item.TradeId);err!=nil {
			log.Sugar.Warnf("[order] committed payment lock cleanup pending, trade_id=%s: %v",item.TradeId,err)
		}
	}
	return nil
}

