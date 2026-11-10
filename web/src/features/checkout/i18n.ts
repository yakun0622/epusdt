import type { Locale } from '../../i18n/locale';
const english={
  "title": "Secure checkout",
  "order": "Order",
  "loading": "Loading payment details…",
  "refresh": "Refresh status",
  "failed": "Payment details cannot be verified. Retry before making a transfer.",
  "statusUnknown": "Status not verified",
  "waiting": "Awaiting payment",
  "paid": "Payment confirmed",
  "expired": "Order expired",
  "choose": "Payment method not selected",
  "chooseHint": "Choose a token/network from the supported payment flow. This read-only view cannot create a payment destination.",
  "detailsPending": "Payment destination is not ready. Do not send funds.",
  "amount": "Order amount",
  "transferAmount": "Exact token amount",
  "network": "Network",
  "token": "Token",
  "address": "Receiving address",
  "created": "Created",
  "expires": "Expires",
  "remaining": "Time remaining",
  "notSelected": "This payment method has not been selected",
  "hosted": "External payment provider",
  "hostedHint": "A provider payment URL exists, but W50 does not open it or initiate payment.",
  "readOnly": "Read-only view. Do not transfer unless the address, token and network are verified.",
  "stale": "This view cannot confirm a fresh payment state.",
  "retry": "Retry",
  "seconds": "s",
  "noAuto": "Status rechecked every 15 seconds while pending.",
  "unit": "Amounts are different currencies: order amount is fiat, exact payment amount is cryptocurrency.",
  "paymentUnavailable": "No validated payment destination is available.",
  "invalidOrder": "Invalid order identifier.",
  "offline": "Unable to load this order right now.",
  "noWrites": "This view never creates transactions, switches networks or submits transaction hashes."
} as const;
export type CheckoutKey=keyof typeof english;
export const checkoutMessages:Record<Locale,Record<CheckoutKey,string>>={
"en-US":english,
"zh-CN":{"title":"安全收银台","order":"订单号","loading":"正在查询付款信息…","refresh":"刷新状态","failed":"无法核验当前付款信息，请先重试，暂勿转账。","statusUnknown":"状态未核实","waiting":"等待付款","paid":"已确认支付","expired":"订单已过期","choose":"等待选择支付方式","chooseHint":"请通过后续完整支付流程选择币种和网络。本只读页面不会创建收款地址。","detailsPending":"收款信息尚未就绪，请勿转账。","amount":"订单金额","transferAmount":"应付代币数量","network":"支付网络","token":"代币","address":"收款地址","created":"创建时间","expires":"到期时间","remaining":"剩余时间","notSelected":"当前支付方式尚未选定","hosted":"第三方支付","hostedHint":"服务端存在第三方支付链接，但 W50 不打开它或主动发起支付。","readOnly":"本页仅展示信息。必须确认地址、币种、网络一致后再处理实际付款。","stale":"无法确认实时支付状态。","retry":"重试","seconds":"秒","noAuto":"待支付期间每 15 秒查询一次最新状态。","unit":"订单金额是法币，应付数量是代币，两者单位不同。","paymentUnavailable":"暂无经核实的收款目标。","invalidOrder":"无效订单号。","offline":"暂时无法加载订单。","noWrites":"本页面不会创建交易、切换网络或提交交易哈希。"},
"zh-TW":{"title":"安全收銀台","order":"訂單編號","loading":"正在查詢付款資訊…","refresh":"更新狀態","failed":"無法驗證目前付款資訊，請先重試，不要轉帳。","statusUnknown":"状态未核实","waiting":"等待付款","paid":"已確認付款","expired":"訂單已逾期","choose":"等待選擇付款方式","chooseHint":"请通过后续完整支付流程选择币种和网络。本只读页面不会创建收款地址。","detailsPending":"收款信息尚未就绪，请勿转账。","amount":"订单金额","transferAmount":"应付代币数量","network":"付款網路","token":"代幣","address":"收款地址","created":"创建时间","expires":"到期时间","remaining":"剩余时间","notSelected":"当前支付方式尚未选定","hosted":"第三方支付","hostedHint":"服务端存在第三方支付链接，但 W50 不打开它或主动发起支付。","readOnly":"本頁僅顯示資訊，請核對地址、代幣與網路。","stale":"无法确认实时支付状态。","retry":"重试","seconds":"秒","noAuto":"待支付期间每 15 秒查询一次最新状态。","unit":"订单金额是法币，应付数量是代币，两者单位不同。","paymentUnavailable":"暂无经核实的收款目标。","invalidOrder":"无效订单号。","offline":"暂时无法加载订单。","noWrites":"本页面不会创建交易、切换网络或提交交易哈希。"},
"ja-JP":{"title":"安全な決済画面","order":"注文番号","loading":"決済情報を確認中…","refresh":"状態を更新","failed":"支払情報を検証できません。送金しないでください。","statusUnknown":"Status not verified","waiting":"入金待ち","paid":"支払確認済み","expired":"注文期限切れ","choose":"支払方法未選択","chooseHint":"Choose a token/network from the supported payment flow. This read-only view cannot create a payment destination.","detailsPending":"Payment destination is not ready. Do not send funds.","amount":"注文金額","transferAmount":"送金数量","network":"ネットワーク","token":"Token","address":"受取アドレス","created":"Created","expires":"Expires","remaining":"Time remaining","notSelected":"This payment method has not been selected","hosted":"External payment provider","hostedHint":"A provider payment URL exists, but W50 does not open it or initiate payment.","readOnly":"読み取り専用です。送金前に詳細を確認してください。","stale":"This view cannot confirm a fresh payment state.","retry":"再試行","seconds":"s","noAuto":"Status rechecked every 15 seconds while pending.","unit":"Amounts are different currencies: order amount is fiat, exact payment amount is cryptocurrency.","paymentUnavailable":"No validated payment destination is available.","invalidOrder":"Invalid order identifier.","offline":"Unable to load this order right now.","noWrites":"This view never creates transactions, switches networks or submits transaction hashes."},
"ko-KR":{"title":"안전 결제","order":"주문번호","loading":"결제 정보 확인 중…","refresh":"상태 새로고침","failed":"결제 정보를 확인할 수 없습니다. 송금하지 마세요.","statusUnknown":"Status not verified","waiting":"결제 대기","paid":"결제 확인","expired":"주문 만료","choose":"결제 방식 미선택","chooseHint":"Choose a token/network from the supported payment flow. This read-only view cannot create a payment destination.","detailsPending":"Payment destination is not ready. Do not send funds.","amount":"주문 금액","transferAmount":"전송 수량","network":"네트워크","token":"Token","address":"수취 주소","created":"Created","expires":"Expires","remaining":"Time remaining","notSelected":"This payment method has not been selected","hosted":"External payment provider","hostedHint":"A provider payment URL exists, but W50 does not open it or initiate payment.","readOnly":"읽기 전용 페이지입니다. 송금 전에 정보를 확인하세요.","stale":"This view cannot confirm a fresh payment state.","retry":"다시 시도","seconds":"s","noAuto":"Status rechecked every 15 seconds while pending.","unit":"Amounts are different currencies: order amount is fiat, exact payment amount is cryptocurrency.","paymentUnavailable":"No validated payment destination is available.","invalidOrder":"Invalid order identifier.","offline":"Unable to load this order right now.","noWrites":"This view never creates transactions, switches networks or submits transaction hashes."},
"ru-RU":{"title":"Безопасная оплата","order":"Номер заказа","loading":"Проверяем платёжные данные…","refresh":"Обновить статус","failed":"Не удалось проверить данные. Не переводите средства.","statusUnknown":"Status not verified","waiting":"Ожидание платежа","paid":"Платёж подтверждён","expired":"Заказ истёк","choose":"Способ оплаты не выбран","chooseHint":"Choose a token/network from the supported payment flow. This read-only view cannot create a payment destination.","detailsPending":"Payment destination is not ready. Do not send funds.","amount":"Сумма заказа","transferAmount":"Сумма в токенах","network":"Сеть","token":"Token","address":"Адрес получателя","created":"Created","expires":"Expires","remaining":"Time remaining","notSelected":"This payment method has not been selected","hosted":"External payment provider","hostedHint":"A provider payment URL exists, but W50 does not open it or initiate payment.","readOnly":"Только просмотр. Проверьте адрес, токен и сеть перед переводом.","stale":"This view cannot confirm a fresh payment state.","retry":"Повторить","seconds":"s","noAuto":"Status rechecked every 15 seconds while pending.","unit":"Amounts are different currencies: order amount is fiat, exact payment amount is cryptocurrency.","paymentUnavailable":"No validated payment destination is available.","invalidOrder":"Invalid order identifier.","offline":"Unable to load this order right now.","noWrites":"This view never creates transactions, switches networks or submits transaction hashes."}
};
export function checkoutLabel(locale:Locale,key:CheckoutKey):string{
 return checkoutMessages[locale][key]??english[key];
}
