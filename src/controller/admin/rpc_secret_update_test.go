package admin

import "testing"

func TestRPCCredentialPatchKeepsLegacyEmptyFormSafe(t *testing.T) {
  absent, include, err := rpcCredentialPatch(&UpdateRpcNodeRequest{})
  if err != nil || include || absent != "" {
    t.Fatalf("missing credential unexpectedly updates key")
  }
  empty := ""
  _, include, err = rpcCredentialPatch(&UpdateRpcNodeRequest{ApiKey:&empty})
  if err != nil || include {
    t.Fatalf("legacy SPA empty api_key must preserve the existing credential")
  }
  changed := "replacement"
  value, include, err := rpcCredentialPatch(&UpdateRpcNodeRequest{ApiKey:&changed})
  if err != nil || !include || value != changed {
    t.Fatalf("nonempty credential replacement not applied")
  }
  value, include, err = rpcCredentialPatch(&UpdateRpcNodeRequest{ClearApiKey:true})
  if err != nil || !include || value != "" {
    t.Fatalf("explicit credential clearing not applied")
  }
  _, _, err = rpcCredentialPatch(&UpdateRpcNodeRequest{ApiKey:&changed,ClearApiKey:true})
  if err == nil {
    t.Fatalf("contradictory replace+clear request must be rejected")
  }
}

func TestRPCEndpointForConsoleRedactsURLSecrets(t *testing.T) {
  endpoint := rpcEndpointForConsole("https://user:password@rpc.example:8443/path/API_SECRET?api_key=QUERY_SECRET#hash")
  if endpoint != "https://rpc.example:8443" {
    t.Fatalf("unsafe or incorrect endpoint display")
  }
  if rpcEndpointForConsole("garbled URL") != "[hidden endpoint]" {
    t.Fatalf("malformed endpoint should not be echoed")
  }
}
