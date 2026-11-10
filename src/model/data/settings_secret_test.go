package data

import (
	"testing"

	"github.com/GMWalletApp/epusdt/model/mdb"
)

func TestSensitiveSettingKeysIncludePaymentAndTelegramTokens(t *testing.T) {
	found := map[string]bool{}
	for _, key := range sensitiveSettingKeys {
		found[key] = true
	}
	for _, key := range []string{"system.telegram_bot_token", mdb.SettingKeyOkPayShopToken,
		mdb.SettingKeyJwtSecret, mdb.SettingKeyInitAdminPasswordPlain} {
		if !found[key] {
			t.Fatalf("private setting %s would be returned in the list", key)
		}
	}
}
