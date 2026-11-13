package task

import "testing"

// Finality cursor verifies minimum confirmations BEFORE scanner delivery;
// never label an unconfirmed fixture transaction "paid".
func TestW61ScannerConfirmationFence(t *testing.T){
 for _,tc:=range []struct{latest int64;confirmations int;want int64}{
  {100,1,100},{100,2,99},{100,6,95},{3,6,0},{0,6,0},{100,0,100},
 }{
  got:=moveConfirmedCursor(tc.latest,tc.confirmations)
  if got!=tc.want{t.Fatalf("head=%d min=%d cursor=%d want=%d",
   tc.latest,tc.confirmations,got,tc.want)}
 }
}
