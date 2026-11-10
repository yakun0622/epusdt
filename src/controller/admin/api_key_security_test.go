package admin

import (
  "net/http"
  "net/http/httptest"
  "strings"
  "testing"

  "github.com/labstack/echo/v4"
)

func TestSensitiveApiKeyResponsesNoStore(t *testing.T) {
  e := echo.New()
  recorder := httptest.NewRecorder()
  ctx := e.NewContext(httptest.NewRequest(http.MethodGet, "/admin/api/v1/api-keys/1/secret", nil), recorder)
  setSensitiveApiKeyNoStore(ctx)
  headers := ctx.Response().Header()
  if !strings.Contains(headers.Get("Cache-Control"), "no-store") ||
    !strings.Contains(headers.Get("Cache-Control"), "private") {
    t.Fatalf("API key secret response may be cacheable: %q", headers.Get("Cache-Control"))
  }
  if headers.Get("Pragma") != "no-cache" || headers.Get("Expires") != "0" {
    t.Fatalf("missing compatibility cache headers")
  }
  if headers.Get("X-Content-Type-Options") != "nosniff" {
    t.Fatalf("sensitive endpoint must set nosniff")
  }
}
