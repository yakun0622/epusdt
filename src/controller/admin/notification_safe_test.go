package admin

import (
  "encoding/json"
  "strings"
  "testing"

  "github.com/GMWalletApp/epusdt/model/mdb"
)

func TestNotificationSafeViewNeverReturnsCredentialConfig(t *testing.T) {
  row:=mdb.NotificationChannel{
    Type:"telegram",Name:"Main",Enabled:true,
    Config:`{"bot_token":"TOP_SECRET","chat_id":"123","proxy":"https://u:p@host/SECRET"}`,
    Events:`{"pay_success":true,"order_expired":false,"daily_report":true,"PRIVATE_SECRET":true}`,
  }
  view:=newNotificationChannelSafeView(row)
  data,err:=json.Marshal(view)
  if err!=nil {t.Fatal(err)}
  for _,secret:=range []string{"TOP_SECRET","bot_token","chat_id","proxy","PRIVATE_SECRET"} {
    if strings.Contains(string(data),secret) {t.Fatalf("safe list leaks: %s",secret)}
  }
  if !view.Configured || !view.Events[mdb.NotifyEventPaySuccess] ||
    !view.Events[mdb.NotifyEventDailyReport] || view.Events[mdb.NotifyEventOrderExpired] {
    t.Fatalf("safe list dropped meaningful non-secret state")
  }
}
