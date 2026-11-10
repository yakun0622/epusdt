package mdb

import (
  "encoding/json"
  "strings"
  "testing"
)

func TestRpcNodeJSONOmitsCredential(t *testing.T) {
  raw, err := json.Marshal(RpcNode{
    Network: "tron", Url: "https://example.com", Type: "http", Weight: 1,
    ApiKey: "SENSITIVE_ONLY_FOR_SERVER", Enabled: true, Purpose: RpcNodePurposeGeneral,
    Status: RpcNodeStatusUnknown,
  })
  if err != nil { t.Fatal(err) }
  if strings.Contains(string(raw), "SENSITIVE_ONLY_FOR_SERVER") || strings.Contains(string(raw), "api_key") {
    t.Fatalf("RPC node response exposes API key field")
  }
  if !strings.Contains(string(raw), "\"enabled\":true") || !strings.Contains(string(raw), "\"status\":\"unknown\"") {
    t.Fatalf("RPC enabled and status fields should remain in response")
  }
}
