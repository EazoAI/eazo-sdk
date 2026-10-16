"use client";

import { EazoPaymentSync } from "@eazo/sdk/payments/next/client";

// Mount once in the root layout so paid payments are granted even when the buyer
// closed the page before returning from checkout.
export function PaymentSync() {
  return <EazoPaymentSync />;
}
