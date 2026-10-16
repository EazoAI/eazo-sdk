import { createEazoPaymentSyncRoute } from "@eazo/sdk/payments/next";
import { fulfillPayment } from "@/lib/eazo-payments/items";

export const POST = createEazoPaymentSyncRoute({ fulfill: fulfillPayment });
