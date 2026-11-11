# W55 — Merchant callback lease, OkPay binding and MySQL 5.7 integration

Date: 2026-11-11. Feature branch: feat/w55-callback-delivery-mysql57-safety.

## Audit findings
- Merchant callbacks currently use process-only callbackInflight and can dispatch twice from two API replicas reading the same pending row. TCP acknowledgements and database commit are not one atomic transaction.
- The old callback result stored callback_num and callback_confirm after HTTP with no durable distributed ownership. Crash before persistence can cause repeat requests.
- Historically child rows carry no merchant callback while parent is the merchant notification owner. An orphan paid child under a still-pending parent must not send a success callback.
- Signed OkPay callbacks are not equivalent to unconditionally paid: order ID, shop ID, provider purchase ID, amount, coin, status and provider row all require binding.

## Implementation
- New additive primary-DB table callback_delivery keyed by trade_id; owner token, 45-second lease deadline, committed delivery marker.
- Both acquisition and finalization use one database transaction each; parent-order row locks (FOR UPDATE MySQL/PostgreSQL) plus a unique lease row and CAS. Recheck parent/child status, provider paid ledger and callback ownership before outbound delivery and before marking success.
- Callback attempts are recorded only after HTTP and while owning the lease, atomically with order callback_num/confirm. HTTP errors leave the order paid and subject to bounded persistent retry/backoff; they never mutate payment evidence or claim.
- Add stable X-Epusdt-Delivery-ID: epusdt:<root trade_id> to GMPay POST and EPay GET without changing signed payloads. A crash after remote delivery before local acknowledgement may cause another delivery after the lease expires. Receivers MUST deduplicate this ID or merchant order ID; exactly-once HTTP delivery is impossible without receiver cooperation.
- Pending delivery discovery excludes child rows, already delivered ledger rows and active leases. Failed parent/child or provider settlement associations are withheld for manual review.
- OkPay signed success payload binds exact amount against BOTH the SQL order and original provider quote, validates provider order ID/coin and provider success code, and atomically persists provider paid + notify_raw + primary order status inside W54 settlement transaction. Invalid or duplicate successful notices cannot settle another order.
- Expiration cleanup releases runtime locks by trade_id rather than address/amount, avoiding stale cleanup of reallocated wallet reservations.
- The W53 read-only hash verification and existing on-chain/token/address/amount/confirmation logic remain unchanged. W31 is not implemented; production src/www and web/ are untouched.

## Tests and release gate
- SQLite: competing workers, stale and expired leases, retry/backoff, orphan parent/child, provider mismatch, database error injection rolls back callback ack; merchant HTTP stable idempotency header, EPay/GMPay tests; scanners and W53/W54 regression.
- MySQL 5.7 requires utf8mb4-safe prefix lengths for legacy indexed TEXT columns; GORM index tags now supply 191-character prefixes without rewriting historical payment data.
- MySQL 5.7 (service container): AutoMigrate on isolated epusdt_w55_ci; two separate GORM connections race for a W54 payment_tx_claim and W55 callback lease; only one settlement and one callback owner.
- A production multi-host failover test with real RPC, real merchant endpoints and an OkPay sandbox remains required before deployment. No automatic reconciliation of historical inconsistent records; unknown outcomes are never called paid.
