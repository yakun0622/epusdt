package admin

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/GMWalletApp/epusdt/config"
)

func TestRateStatusRedactedSnapshotOmitsCredentialURLsAndErrors(t *testing.T) {
	payload := config.RateStatus{
		Mode:"auto",APIURL:"https://provider.example/?api_key=SECRET",
		CacheTTLSeconds:300,
		Bases:[]config.RateBaseStatus{{
			Base:"cny",SourceURL:"https://provider.example/key/SECRET",
			LastError:"Failed calling https://provider.example/?api_key=SECRET",
			Rates:map[string]float64{"usdt":0.14},
		}},
	}
	redacted := redactRateStatus(payload)
	out,err:=json.Marshal(redacted)
	if err!=nil {t.Fatal(err)}
	if strings.Contains(string(out),"SECRET") || strings.Contains(string(out),"api_key") {
		t.Fatal("rate status leaked credential URL or error")
	}
	if redacted.Bases[0].Rates["usdt"]!=0.14 || payload.APIURL=="" {
		t.Fatal("redaction must preserve rate data without mutating original")
	}
}

func TestSettingsURLRedactionDropsQueryPathAndCredentials(t *testing.T) {
  got := redactSettingsURL("https://user:pass@provider.example:8443/private/SECRET?token=SECRET")
  if got != "https://provider.example:8443" {
    t.Fatalf("unsafe settings URL projection")
  }
  if redactSettingsURL("not-a-valid-url") != "[configured URL hidden]" {
    t.Fatal("unparseable URL must not be shown")
  }
  if redactSettingsURL("") != "" {
    t.Fatal("unset URL must stay unset")
  }
}
